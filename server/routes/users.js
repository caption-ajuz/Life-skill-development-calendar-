import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Distribution from '../models/Distribution.js';
import Collection from '../models/Collection.js';
import MoneyTransfer from '../models/MoneyTransfer.js';
import StockAllocation from '../models/StockAllocation.js';
import Expense from '../models/Expense.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateRequired, isValidObjectId } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/users - Super admin, Usthad, and Team Leader (scoped to own team)
router.get('/', async (req, res) => {
  try {
    const { role, teamId, isActive, search, page = 1, limit = 50 } = req.query;
    const query = {};

    // Scope check: Team Leader can only list members in their authorized team
    if (req.user.role === 'team_leader') {
      const leaderTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;
      if (!leaderTeamId) {
        return res.json({ success: true, data: { users: [], pagination: { total: 0, page: 1, limit: 50, pages: 1 } } });
      }
      query.teamId = leaderTeamId;
      if (role && role === 'team_member') query.role = role;
    } else if (['super_admin', 'usthad'].includes(req.user.role)) {
      if (role) query.role = role;
      if (teamId && isValidObjectId(teamId)) query.teamId = teamId;
    } else {
      // Team members only see self
      query._id = req.user._id;
    }

    if (isActive !== undefined && isActive !== 'all') {
      query.isActive = isActive === 'true' || isActive === true;
    }

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

    const userIds = users.map((u) => u._id);
    const [allocsByUser, distsByUser] = await Promise.all([
      StockAllocation.aggregate([
        { $match: { memberId: { $in: userIds } } },
        { $group: { _id: '$memberId', total: { $sum: '$quantity' } } }
      ]),
      Distribution.aggregate([
        { $match: { memberId: { $in: userIds }, status: { $in: ['active', 'approved'] } } },
        { $group: { _id: '$memberId', total: { $sum: '$quantity' } } }
      ])
    ]);

    const allocMap = new Map(allocsByUser.map((a) => [a._id.toString(), a.total]));
    const distMap = new Map(distsByUser.map((d) => [d._id.toString(), d.total]));

    const usersWithStock = users.map((u) => {
      const uObj = u.toObject();
      const allocated = allocMap.get(u._id.toString()) || 0;
      const distributed = distMap.get(u._id.toString()) || 0;
      uObj.allocatedStock = allocated;
      uObj.distributedStock = distributed;
      uObj.remainingStock = Math.max(0, allocated - distributed);
      return uObj;
    });

    return res.json({
      success: true,
      data: {
        users: usersWithStock,
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

// POST /api/users - Super admin (any role) or Team Leader (strictly restricted to their own team members)
router.post('/', requireRole('super_admin', 'team_leader'), async (req, res) => {
  try {
    const { username, password, fullName, phone, pin, role, teamId, profilePhoto } = req.body;

    const check = validateRequired(req.body, ['username', 'password', 'fullName']);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: check.error });
    }
    if (typeof username !== 'string' || typeof password !== 'string' || typeof fullName !== 'string') {
      return res.status(400).json({ success: false, error: 'Username, password, and name must be valid text.' });
    }
    if (username.trim().length < 3 || username.trim().length > 50 || !fullName.trim() || fullName.trim().length > 100) {
      return res.status(400).json({ success: false, error: 'Username must be 3 to 50 characters and name must be 1 to 100 characters.' });
    }

    let assignedRole = role || 'team_member';
    let assignedTeamId = teamId || null;

    // Strict Enforcement for Team Leader:
    if (req.user.role === 'team_leader') {
      const leaderTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;
      if (!leaderTeamId) {
        return res.status(400).json({ success: false, error: 'You are not assigned to a team yet. Contact Super Admin.' });
      }
      // Force role to team_member and team to leader's team
      assignedRole = 'team_member';
      assignedTeamId = leaderTeamId;
    } else if (req.user.role === 'super_admin') {
      if (!['super_admin', 'usthad', 'team_leader', 'team_member'].includes(assignedRole)) {
        return res.status(400).json({ success: false, error: 'Invalid user role specified.' });
      }
      if (['team_leader', 'team_member'].includes(assignedRole) && (!assignedTeamId || !isValidObjectId(assignedTeamId))) {
        return res.status(400).json({ success: false, error: 'Team assignment is required for team leaders and members.' });
      }
    }

    const cleanUsername = username.toLowerCase().trim();
    const existing = await User.findOne({ username: cleanUsername });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Username is already taken. Please choose another.' });
    }

    if (password.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters.' });
    }

    let normalizedPhone = '';
    if (phone) {
      if (typeof phone !== 'string') {
        return res.status(400).json({ success: false, error: 'Phone number must be text.' });
      }
      normalizedPhone = phone.replace(/\D/g, '');
      if (normalizedPhone && !/^\d{10,15}$/.test(normalizedPhone)) {
        return res.status(400).json({ success: false, error: 'Phone number must contain 10 to 15 digits.' });
      }
    }

    let cleanPin = null;
    let pinHash = null;
    if (pin && typeof pin === 'string') {
      cleanPin = pin.trim();
      if (!/^\d{4,6}$/.test(cleanPin)) {
        return res.status(400).json({ success: false, error: 'PIN must be 4 or 6 numeric digits.' });
      }
      pinHash = await bcrypt.hash(cleanPin, 10);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username: cleanUsername,
      passwordHash,
      pinHash,
      passwordHint: password,
      pinHint: cleanPin || '',
      fullName: fullName.trim(),
      phone: normalizedPhone,
      profilePhoto: profilePhoto || null,
      role: assignedRole,
      teamId: assignedTeamId,
      mustChangePassword: true, // Temporary password flag: requires change upon first login
      isActive: true
    });

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'create',
      newValues: { username: user.username, role: user.role, teamId: user.teamId, mustChangePassword: true },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.status(201).json({
      success: true,
      data: user.toJSON(),
      initialCredentials: {
        username: cleanUsername,
        temporaryPassword: password,
        pin: cleanPin,
        mustChangePassword: true
      }
    });
  } catch (err) {
    console.error('Create user error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create user account.' });
  }
});

// GET /api/users/:id/profile - Individual Member Profile with personal stats & financial records
router.get('/:id/profile', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    const targetUser = await User.findById(id).populate('teamId', 'name');
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Role-based profile visibility:
    // Super Admin & Usthad: can view anyone
    // Team Leader: can view themselves and members of their own team
    // Team Member: can ONLY view their own profile
    if (req.user.role === 'team_member') {
      if (req.user._id.toString() !== id) {
        return res.status(403).json({ success: false, error: 'Access denied: You may only view your own profile.' });
      }
    } else if (req.user.role === 'team_leader') {
      const leaderTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      const targetTeamId = targetUser.teamId ? (targetUser.teamId._id || targetUser.teamId).toString() : null;
      if (req.user._id.toString() !== id && leaderTeamId !== targetTeamId) {
        return res.status(403).json({ success: false, error: 'Access denied: You may only view members of your own team.' });
      }
    }

    const teamId = targetUser.teamId ? (targetUser.teamId._id || targetUser.teamId) : null;

    // Aggregate member-level financials and stock
    const [
      stockAlloc,
      distAgg,
      colCalendarAgg,
      colOtherAgg,
      transferConfirmedAgg,
      transferPendingAgg,
      expenseAgg,
      recentDistributions,
      recentCollections,
      recentTransfers,
      recentExpenses
    ] = await Promise.all([
      StockAllocation.aggregate([
        { $match: { memberId: targetUser._id } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Distribution.aggregate([
        { $match: { memberId: targetUser._id, status: { $in: ['active', 'approved'] } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Collection.aggregate([
        { $match: { memberId: targetUser._id, status: { $in: ['active', 'approved'] }, incomeType: { $ne: 'other_income' } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Collection.aggregate([
        { $match: { memberId: targetUser._id, status: { $in: ['active', 'approved'] }, incomeType: 'other_income' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      MoneyTransfer.aggregate([
        { $match: { fromUserId: targetUser._id, status: 'confirmed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      MoneyTransfer.aggregate([
        { $match: { fromUserId: targetUser._id, status: { $in: ['pending', 'awaiting_confirmation'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Expense.aggregate([
        { $match: { memberId: targetUser._id } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Distribution.find({ memberId: targetUser._id }).populate('areaId', 'name district').sort({ date: -1 }).limit(10),
      Collection.find({ memberId: targetUser._id }).populate('areaId', 'name district').sort({ date: -1 }).limit(10),
      MoneyTransfer.find({ fromUserId: targetUser._id }).sort({ transferDate: -1 }).limit(10),
      Expense.find({ memberId: targetUser._id }).sort({ date: -1 }).limit(10)
    ]);

    const allocatedStock = stockAlloc ? stockAlloc.quantity : 0;
    const distributedStock = distAgg[0] ? distAgg[0].total : 0;
    const remainingStock = Math.max(0, allocatedStock - distributedStock);

    const calendarCollections = colCalendarAgg[0] ? colCalendarAgg[0].total : 0;
    const otherIncome = colOtherAgg[0] ? colOtherAgg[0].total : 0;
    const totalCollected = calendarCollections + otherIncome;

    const confirmedTransfers = transferConfirmedAgg[0] ? transferConfirmedAgg[0].total : 0;
    const pendingTransfers = transferPendingAgg[0] ? transferPendingAgg[0].total : 0;
    const totalExpenses = expenseAgg[0] ? expenseAgg[0].total : 0;

    // In-hand cash balance = Collections - Confirmed Transfers - Pending Transfers
    const inHandCash = Math.max(0, totalCollected - confirmedTransfers - pendingTransfers);

    return res.json({
      success: true,
      data: {
        user: targetUser.toJSON(),
        stats: {
          allocatedStock,
          distributedStock,
          remainingStock,
          calendarCollections,
          otherIncome,
          totalCollected,
          confirmedTransfers,
          pendingTransfers,
          inHandCash,
          totalExpenses
        },
        activity: {
          distributions: recentDistributions,
          collections: recentCollections,
          transfers: recentTransfers,
          expenses: recentExpenses
        }
      }
    });
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch user profile.' });
  }
});

// PUT /api/users/:id - Super admin (all fields) or Team Leader (own member contact info only)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    const user = await User.findById(id).select('+pinHash');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const isSuperAdmin = req.user.role === 'super_admin';
    const isTeamLeader = req.user.role === 'team_leader';
    const isSelf = req.user._id.toString() === id;

    if (!isSuperAdmin && !isTeamLeader && !isSelf) {
      return res.status(403).json({ success: false, error: 'Permission denied.' });
    }

    if (isTeamLeader && !isSelf) {
      const leaderTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      const userTeamId = user.teamId ? (user.teamId._id || user.teamId).toString() : null;
      if (leaderTeamId !== userTeamId) {
        return res.status(403).json({ success: false, error: 'You may only edit members of your own team.' });
      }
    }

    const { fullName, phone, role, teamId, collectionTarget } = req.body;
    const oldValues = { fullName: user.fullName, phone: user.phone, role: user.role, teamId: user.teamId, collectionTarget: user.collectionTarget };

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
      user.phone = normalizedPhone;
    }

    // Role, team reassignment, and collection target are strictly super_admin privileges
    if (isSuperAdmin) {
      if (role && ['super_admin', 'usthad', 'team_leader', 'team_member'].includes(role)) {
        if (user._id.toString() === req.user._id.toString() && role !== 'super_admin') {
          return res.status(400).json({ success: false, error: 'Cannot demote your own Super Admin account.' });
        }
        user.role = role;
      }
      if (teamId !== undefined) {
        user.teamId = isValidObjectId(teamId) ? teamId : null;
      }
      if (collectionTarget !== undefined) {
        const targetNum = Number(collectionTarget);
        if (isNaN(targetNum) || targetNum < 0) {
          return res.status(400).json({ success: false, error: 'Collection target must be a non-negative number.' });
        }
        user.collectionTarget = Math.round(targetNum);
      }
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

// PUT /api/users/:id/target - Super Admin sets individual collection target
router.put('/:id/target', requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { target } = req.body;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }
    const targetNum = Number(target);
    if (isNaN(targetNum) || targetNum < 0) {
      return res.status(400).json({ success: false, error: 'Target amount must be a non-negative number.' });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    const oldTarget = user.collectionTarget || 25000;
    user.collectionTarget = Math.round(targetNum);
    await user.save();

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'update_target',
      oldValues: { collectionTarget: oldTarget },
      newValues: { collectionTarget: user.collectionTarget },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: `Collection target updated to ₹${user.collectionTarget.toLocaleString('en-IN')}`,
      data: user.toJSON()
    });
  } catch (err) {
    console.error('Update user target error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update collection target.' });
  }
});

// POST /api/users/batch-target - Super Admin sets overall member target across all members
router.post('/batch-target', requireRole('super_admin'), async (req, res) => {
  try {
    const { overallTarget, targetRole = 'team_member', applyToLeaders = false } = req.body;
    const targetNum = Number(overallTarget);
    if (isNaN(targetNum) || targetNum <= 0) {
      return res.status(400).json({ success: false, error: 'Overall target must be a positive number.' });
    }

    const CampaignConfig = (await import('../models/CampaignConfig.js')).default;
    let config = await CampaignConfig.findOne();
    if (config) {
      config.defaultMemberTarget = Math.round(targetNum);
      await config.save();
    }

    const rolesToUpdate = applyToLeaders ? ['team_member', 'team_leader'] : ['team_member'];
    const result = await User.updateMany(
      { role: { $in: rolesToUpdate }, isActive: true },
      { $set: { collectionTarget: Math.round(targetNum) } }
    );

    await logAudit({
      entityType: 'campaign_config',
      entityId: config ? config._id : req.user._id,
      action: 'batch_update_target',
      newValues: { overallTarget: Math.round(targetNum), updatedCount: result.modifiedCount, roles: rolesToUpdate },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: `Overall target set to ₹${Math.round(targetNum).toLocaleString('en-IN')}. Updated ${result.modifiedCount} participant(s).`,
      data: {
        overallTarget: Math.round(targetNum),
        updatedCount: result.modifiedCount
      }
    });
  } catch (err) {
    console.error('Batch update target error:', err);
    return res.status(500).json({ success: false, error: 'Failed to set overall collection target.' });
  }
});

// PUT /api/users/:id/toggle-active - Super admin or Team Leader (for own members)
router.put('/:id/toggle-active', async (req, res) => {
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

    const isSuperAdmin = req.user.role === 'super_admin';
    const isTeamLeader = req.user.role === 'team_leader';

    if (!isSuperAdmin && !isTeamLeader) {
      return res.status(403).json({ success: false, error: 'Permission denied.' });
    }

    if (isTeamLeader) {
      const leaderTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      const userTeamId = user.teamId ? (user.teamId._id || user.teamId).toString() : null;
      if (leaderTeamId !== userTeamId || user.role !== 'team_member') {
        return res.status(403).json({ success: false, error: 'You may only toggle status for members of your own team.' });
      }
    }

    user.isActive = !user.isActive;
    await user.save();

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: user.isActive ? 'activate' : 'deactivate',
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

// PUT /api/users/:id/reset-password - Super admin or Team Leader (generates or sets temporary password)
router.put('/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const isSuperAdmin = req.user.role === 'super_admin';
    const isTeamLeader = req.user.role === 'team_leader';

    if (!isSuperAdmin && !isTeamLeader) {
      return res.status(403).json({ success: false, error: 'Permission denied.' });
    }

    if (isTeamLeader) {
      const leaderTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      const userTeamId = user.teamId ? (user.teamId._id || user.teamId).toString() : null;
      if (leaderTeamId !== userTeamId || user.role !== 'team_member') {
        return res.status(403).json({ success: false, error: 'You may only reset passwords for members of your own team.' });
      }
    }

    const tempPassword = newPassword && newPassword.length >= 4
      ? newPassword
      : `LSC@${Math.floor(1000 + Math.random() * 9000)}`;

    user.passwordHash = await bcrypt.hash(tempPassword, 10);
    user.passwordHint = tempPassword;
    user.mustChangePassword = true; // User must change password upon first login
    await user.save();

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'reset_password',
      newValues: { mustChangePassword: true, passwordHint: tempPassword },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: 'Temporary password generated successfully.',
      temporaryPassword: tempPassword,
      passwordHint: tempPassword,
      mustChangePassword: true,
      data: user.toJSON()
    });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ success: false, error: 'Failed to reset password.' });
  }
});

// PUT /api/users/:id/reset-pin - Super admin or Team Leader (independent PIN reset)
router.put('/:id/reset-pin', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPin } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    const user = await User.findById(id).select('+pinHash');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const isSuperAdmin = req.user.role === 'super_admin';
    const isTeamLeader = req.user.role === 'team_leader';

    if (!isSuperAdmin && !isTeamLeader) {
      return res.status(403).json({ success: false, error: 'Permission denied.' });
    }

    if (isTeamLeader) {
      const leaderTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      const userTeamId = user.teamId ? (user.teamId._id || user.teamId).toString() : null;
      if (leaderTeamId !== userTeamId || user.role !== 'team_member') {
        return res.status(403).json({ success: false, error: 'You may only reset PINs for members of your own team.' });
      }
    }

    const cleanPin = newPin && /^\d{4,6}$/.test(newPin.trim())
      ? newPin.trim()
      : String(Math.floor(1000 + Math.random() * 9000));

    user.pinHash = await bcrypt.hash(cleanPin, 10);
    user.pinHint = cleanPin;
    await user.save();

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'reset_pin',
      newValues: { pinReset: true, pinHint: cleanPin },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: 'PIN reset successfully.',
      temporaryPin: cleanPin,
      pinHint: cleanPin,
      data: user.toJSON()
    });
  } catch (err) {
    console.error('Reset PIN error:', err);
    return res.status(500).json({ success: false, error: 'Failed to reset PIN.' });
  }
});

// PUT /api/users/:id/credentials - Admin full credential setup
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

    if (clearPassword === true) {
      user.passwordHash = await bcrypt.hash('cleared_' + Math.random().toString(36), 10);
      user.passwordHint = '';
    } else if (password && typeof password === 'string') {
      if (password.length < 4) {
        return res.status(400).json({ success: false, error: 'Password must be at least 4 characters.' });
      }
      user.passwordHash = await bcrypt.hash(password, 10);
      user.passwordHint = password;
      user.mustChangePassword = false;
    }

    if (clearPin === true) {
      user.pinHash = null;
      user.pinHint = '';
    } else if (pin && typeof pin === 'string') {
      const cleanPin = pin.trim();
      if (!/^\d{4,6}$/.test(cleanPin)) {
        return res.status(400).json({ success: false, error: 'PIN must be 4 or 6 numeric digits.' });
      }
      user.pinHash = await bcrypt.hash(cleanPin, 10);
      user.pinHint = cleanPin;
    }

    await user.save();

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'update_credentials',
      newValues: { username: user.username },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: 'Credentials updated successfully.',
      data: user.toJSON()
    });
  } catch (err) {
    console.error('Update credentials error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update credentials.' });
  }
});

// DELETE /api/users/:id/password - Super admin clears password
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
    await user.save();

    await logAudit({
      entityType: 'user',
      entityId: user._id,
      action: 'delete_password',
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Password cleared successfully.' });
  } catch (err) {
    console.error('Delete password error:', err);
    return res.status(500).json({ success: false, error: 'Failed to clear password.' });
  }
});

// DELETE /api/users/:id - Permanently delete inactive account (Super Admin only)
router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    if (user.role === 'super_admin' || user.username === 'ajash.admin') {
      return res.status(403).json({ success: false, error: 'Cannot delete the Super Admin account.' });
    }
    if (user.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Only inactive accounts can be permanently deleted. Please deactivate this account first.'
      });
    }

    const Team = (await import('../models/Team.js')).default;
    await Team.updateMany({ leaderId: id }, { $set: { leaderId: null } });

    await User.findByIdAndDelete(id);

    await logAudit({
      entityType: 'user',
      entityId: id,
      action: 'delete',
      oldValues: { username: user.username, fullName: user.fullName, role: user.role },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: `User account @${user.username} (${user.fullName}) permanently deleted.`
    });
  } catch (err) {
    console.error('Delete user error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete user account.' });
  }
});

export default router;
