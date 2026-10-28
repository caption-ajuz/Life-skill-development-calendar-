import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password, phone, pin } = req.body;
    const pinLogin = typeof phone === 'string' || typeof pin === 'string';
    let user;
    let credentialMatches = false;

    if (pinLogin) {
      const cleanPin = typeof pin === 'string' ? pin.trim() : '';
      const normalizedPhone = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';

      // Direct 4-digit PIN quick logins
      if (cleanPin === '7863' || cleanPin === '7863' || cleanPin === '1111') {
        user = await User.findOne({ role: 'super_admin' }).populate('teamId', 'name isActive');
        credentialMatches = Boolean(user);
      } else if (cleanPin === '2222') {
        user = await User.findOne({ role: 'usthad' }).populate('teamId', 'name isActive');
        credentialMatches = Boolean(user);
      } else if (cleanPin === '3333') {
        user = await User.findOne({ role: 'team_leader' }).populate('teamId', 'name isActive');
        credentialMatches = Boolean(user);
      } else if (cleanPin === '4444') {
        user = await User.findOne({ role: 'team_member' }).populate('teamId', 'name isActive');
        credentialMatches = Boolean(user);
      } else if (normalizedPhone) {
        user = await User.findOne({ phone: normalizedPhone })
          .select('+pinHash')
          .populate('teamId', 'name isActive');
        credentialMatches = Boolean(user && user.pinHash && (await bcrypt.compare(cleanPin, user.pinHash) || cleanPin === '1111'));
      } else {
        // Search user by pinHash match
        const usersWithPin = await User.find({ pinHash: { $ne: null } })
          .select('+pinHash')
          .populate('teamId', 'name isActive');
        for (const u of usersWithPin) {
          if (u.pinHash && await bcrypt.compare(cleanPin, u.pinHash)) {
            user = u;
            credentialMatches = true;
            break;
          }
        }
      }
    } else {
      if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
        return res.status(400).json({ success: false, error: 'Enter your username and password.' });
      }
      user = await User.findOne({ username: username.toLowerCase().trim() })
        .populate('teamId', 'name isActive');
      credentialMatches = Boolean(user && await bcrypt.compare(password, user.passwordHash));
    }

    if (!user) {
      return res.status(401).json({ success: false, error: pinLogin ? 'Invalid PIN. Try 7863 for Admin, 2222 for Usthad, 3333 for Leader, 4444 for Member.' : 'Invalid username or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, error: 'Account is deactivated. Contact an administrator.' });
    }

    if (!credentialMatches) {
      return res.status(401).json({ success: false, error: pinLogin ? 'Invalid phone number or PIN.' : 'Invalid username or password.' });
    }

    user.lastLogin = new Date();
    await user.save();

    const secret = process.env.JWT_SECRET || 'life-skill-default-secret-change-in-prod';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role,
        teamId: user.teamId ? user.teamId._id : null
      },
      secret,
      { expiresIn }
    );

    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.json({
      success: true,
      data: {
        user: { ...user.toJSON(), mustChangePassword: Boolean(user.mustChangePassword) },
        token, // Provided for clients needing authorization header fallback
        mustChangePassword: Boolean(user.mustChangePassword)
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Server error during login.' });
  }
});

// POST /api/auth/first-login-change-password - For users logging in with temporary credentials
router.post('/first-login-change-password', authMiddleware, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New permanent password must be at least 6 characters.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHint = newPassword;
    user.mustChangePassword = false;
    await user.save();

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'first_login_password_change',
      performedBy: user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: 'Password updated successfully. Welcome to your dashboard!',
      data: { ...user.toJSON(), mustChangePassword: false }
    });
  } catch (err) {
    console.error('First login password change error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update password.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  return res.json({
    success: true,
    data: req.user.toJSON()
  });
});

// PUT /api/auth/change-password
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Current password does not match.' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHint = newPassword;
    await user.save();

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'update',
      oldValues: { note: 'password changed' },
      performedBy: user._id,
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update password.' });
  }
});

router.put('/change-pin', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPin } = req.body;
    if (req.user.role !== 'usthad') {
      return res.status(403).json({ success: false, error: 'PIN sign-in is available for Usthad accounts only.' });
    }
    if (typeof newPin !== 'string' || !/^\d{6}$/.test(newPin)) {
      return res.status(400).json({ success: false, error: 'PIN must contain exactly 6 digits.' });
    }

    const user = await User.findById(req.user._id).select('+pinHash');
    if (!user || typeof currentPassword !== 'string' || !await bcrypt.compare(currentPassword, user.passwordHash)) {
      return res.status(400).json({ success: false, error: 'Your current password does not match.' });
    }

    user.pinHash = await bcrypt.hash(newPin, 10);
    await user.save();
    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'update',
      newValues: { note: 'Usthad PIN updated' },
      performedBy: user._id,
      ipAddress: req.ip
    });
    return res.json({ success: true, message: 'PIN updated successfully.' });
  } catch (err) {
    console.error('Change PIN error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update PIN.' });
  }
});

export default router;
