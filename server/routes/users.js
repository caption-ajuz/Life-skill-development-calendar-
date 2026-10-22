import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateRequired, isValidObjectId } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/users - Super admin & Usthad can view user lists
router.get('/', requireRole('super_admin', 'usthad'), async (req, res) => {
  try {
    const { role, teamId, search, page = 1, limit = 50 } = req.query;
    const query = {};

    if (role) query.role = role;
    if (teamId && isValidObjectId(teamId)) query.teamId = teamId;
    if (search) {
      const s = search.trim();
      query.$or = [
        { fullName: { $regex: s, $options: 'i' } },
        { username: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } }
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-passwordHash -pinHash')
        .populate('teamId', 'name')
        .sort({ fullName: 1 })
        .skip(skip)
        .limit(limitNum),
      User.countDocuments(query)
    ]);

    return res.json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch users.' });
  }
});

// POST /api/users - Super admin only
router.post('/', requireRole('super_admin'), async (req, res) => {
  try {
    const { username, password, fullName, phone, pin, role, teamId } = req.body;

    const check = validateRequired(req.body, ['username', 'password', 'fullName', 'role']);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: check.error });
    }
    if (typeof username !== 'string' || typeof password !== 'string' || typeof fullName !== 'string' || typeof role !== 'string') {
      return res.status(400).json({ success: false, error: 'Username, password, name, and role must be valid text.' });
    }
    if (username.trim().length < 3 || username.trim().length > 50 || !fullName.trim() || fullName.trim().length > 100) {
      return res.status(400).json({ success: false, error: 'Username must be 3 to 50 characters and name must be 1 to 100 characters.' });
    }

    if (!['super_admin', 'usthad', 'team_leader', 'team_member'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid user role.' });
    }

    if (['team_leader', 'team_member'].includes(role) && (!teamId || !isValidObjectId(teamId))) {
      return res.status(400).json({ success: false, error: 'Team is required for team leaders and members.' });
    }

    const cleanUsername = username.toLowerCase().trim();
    const existing = await User.findOne({ username: cleanUsername });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Username is already taken.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    }

    let normalizedPhone = '';
    if (phone) {
      if (typeof phone !== 'string') {
        return res.status(400).json({ success: false, error: 'Phone number must be text.' });
      }
      normalizedPhone = phone.replace(/\D/g, '');
      if (!/^\d{10,15}$/.test(normalizedPhone)) {
        return res.status(400).json({ success: false, error: 'Phone number must contain 10 to 15 digits.' });
      }
    }

    if (role === 'usthad' && (!normalizedPhone || typeof pin !== 'string' || !/^\d{6}$/.test(pin))) {
      return res.status(400).json({ success: false, error: 'Usthad accounts require a phone number and a 6-digit PIN.' });
    }

    if (role === 'usthad' && await User.findOne({ phone: normalizedPhone, pinHash: { $type: 'string' } })) {
      return res.status(409).json({ success: false, error: 'This phone number is already enabled for PIN sign-in.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const pinHash = role === 'usthad' ? await bcrypt.hash(pin, 10) : null;
    const user = await User.create({
      username: cleanUsername,
      passwordHash,
      pinHash,
      fullName: fullName.trim(),
      phone: normalizedPhone,
      role,
      teamId: teamId || null,
      isActive: true
    });

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'create',
      newValues: { username: user.username, role: user.role, teamId: user.teamId, pinLoginEnabled: Boolean(user.pinHash) },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.status(201).json({
      success: true,
      data: user.toJSON()
    });
  } catch (err) {
    console.error('Create user error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create user.' });
  }
});

// PUT /api/users/:id - Super admin only
router.put('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    const user = await User.findById(id).select('+pinHash');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const { fullName, phone, role, teamId } = req.body;
    const oldValues = { fullName: user.fullName, phone: user.phone, role: user.role, teamId: user.teamId };

    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || !fullName.trim() || fullName.trim().length > 100) {
        return res.status(400).json({ success: false, error: 'Name must be between 1 and 100 characters.' });
      }
      user.fullName = fullName.trim();
    }
    if (phone !== undefined) {
      if (typeof phone !== 'string') {
        return res.status(400).json({ success: false, error: 'Phone number must be text.' });
      }
      const normalizedPhone = phone.replace(/\D/g, '');
      if (normalizedPhone && !/^\d{10,15}$/.test(normalizedPhone)) {
        return res.status(400).json({ success: false, error: 'Phone number must contain 10 to 15 digits.' });
      }
      if (user.role === 'usthad' && user.pinHash && !normalizedPhone) {
        return res.status(400).json({ success: false, error: 'A phone number is required while PIN sign-in is enabled.' });
      }
      if (user.role === 'usthad' && normalizedPhone && await User.findOne({
        _id: { $ne: user._id },
        phone: normalizedPhone,
        pinHash: { $type: 'string' }
      })) {
        return res.status(409).json({ success: false, error: 'This phone number is already enabled for PIN sign-in.' });
      }
      user.phone = normalizedPhone;
    }
    if (role && ['super_admin', 'usthad', 'team_leader', 'team_member'].includes(role)) {
      // Don't allow super admin to demote themselves
      if (user._id.toString() === req.user._id.toString() && role !== 'super_admin') {
        return res.status(400).json({ success: false, error: 'Cannot demote your own Super Admin account.' });
      }
      user.role = role;
    }
    if (teamId !== undefined) {
      user.teamId = isValidObjectId(teamId) ? teamId : null;
    }

    await user.save();

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'update',
      oldValues,
      newValues: { fullName: user.fullName, phone: user.phone, role: user.role, teamId: user.teamId },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      data: user.toJSON()
    });
  } catch (err) {
    console.error('Update user error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update user.' });
  }
});

// PUT /api/users/:id/toggle-active
router.put('/:id/toggle-active', requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    if (id === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'Cannot deactivate your own account.' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    user.isActive = !user.isActive;
    await user.save();

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: user.isActive ? 'update' : 'delete',
      newValues: { isActive: user.isActive },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      data: { id: user._id, isActive: user.isActive }
    });
  } catch (err) {
    console.error('Toggle active error:', err);
    return res.status(500).json({ success: false, error: 'Failed to toggle account status.' });
  }
});

// PUT /api/users/:id/reset-password
router.put('/:id/reset-password', requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHint = newPassword;
    await user.save();

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'update',
      newValues: { note: 'password reset by admin' },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ success: false, error: 'Failed to reset password.' });
  }
});

// PUT /api/users/:id/credentials - Admin can set up username, password, and pin
router.put('/:id/credentials', requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, pin, clearPassword, clearPin } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    const user = await User.findById(id).select('+passwordHash +pinHash');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const oldValues = { username: user.username, hasPassword: Boolean(user.passwordHash), hasPin: Boolean(user.pinHash) };

    // Update username if requested
    if (username && typeof username === 'string') {
      const cleanUsername = username.toLowerCase().trim();
      if (cleanUsername !== user.username) {
        if (cleanUsername.length < 3 || cleanUsername.length > 50) {
          return res.status(400).json({ success: false, error: 'Username must be between 3 and 50 characters.' });
        }
        const existing = await User.findOne({ username: cleanUsername, _id: { $ne: user._id } });
        if (existing) {
          return res.status(400).json({ success: false, error: 'Username is already taken.' });
        }
        user.username = cleanUsername;
      }
    }

    // Clear password if requested
    if (clearPassword === true) {
      user.passwordHash = await bcrypt.hash('nopassword_' + Math.random().toString(36), 10);
      user.passwordHint = '';
    } else if (password && typeof password === 'string') {
      if (password.length < 4) {
        return res.status(400).json({ success: false, error: 'Password must be at least 4 characters.' });
      }
      user.passwordHash = await bcrypt.hash(password, 10);
      user.passwordHint = password;
    }

    // Clear PIN if requested
    if (clearPin === true) {
      user.pinHash = null;
      user.pinHint = '';
    } else if (pin && typeof pin === 'string') {
      const cleanPin = pin.trim();
      if (!/^\d{4,6}$/.test(cleanPin)) {
        return res.status(400).json({ success: false, error: 'PIN must be 4 or 6 digits.' });
      }
      user.pinHash = await bcrypt.hash(cleanPin, 10);
      user.pinHint = cleanPin;
    }

    await user.save();

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'update_credentials',
      oldValues,
      newValues: { username: user.username, hasPassword: Boolean(user.passwordHash), hasPin: Boolean(user.pinHash) },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const safeUser = user.toJSON();
    safeUser.passwordHint = user.passwordHint || '';
    safeUser.pinHint = user.pinHint || '';

    return res.json({
      success: true,
      message: 'Credentials updated successfully.',
      data: safeUser
    });
  } catch (err) {
    console.error('Update credentials error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update credentials.' });
  }
});

// DELETE /api/users/:id/password - Admin can delete/clear a user password
router.delete('/:id/password', requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    user.passwordHash = await bcrypt.hash('cleared_' + Math.random().toString(36), 10);
    user.passwordHint = '';
    await user.save();

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'delete_password',
      newValues: { passwordCleared: true },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Password cleared successfully.' });
  } catch (err) {
    console.error('Delete password error:', err);
    return res.status(500).json({ success: false, error: 'Failed to clear password.' });
  }
});

export default router;
