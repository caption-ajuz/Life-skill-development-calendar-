import express from 'express';
import Distribution from '../models/Distribution.js';
import StockAllocation from '../models/StockAllocation.js';
import Correction from '../models/Correction.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { isValidObjectId, isPositiveNumber } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/distributions - List distribution entries with filters & pagination
router.get('/', async (req, res) => {
  try {
    const { teamId, memberId, areaId, status, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const query = {};

    // Role-based scoping
    if (req.user.role === 'team_member') {
      query.memberId = req.user._id;
    } else if (req.user.role === 'team_leader') {
      const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;
      query.teamId = userTeamId;
      if (memberId && isValidObjectId(memberId)) query.memberId = memberId;
    } else {
      if (teamId && isValidObjectId(teamId)) query.teamId = teamId;
      if (memberId && isValidObjectId(memberId)) query.memberId = memberId;
    }

    if (areaId && isValidObjectId(areaId)) query.areaId = areaId;
    if (status) query.status = status;

    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [distributions, total] = await Promise.all([
      Distribution.find(query)
        .populate('memberId', 'fullName phone')
        .populate('teamId', 'name')
        .populate('areaId', 'name district')
        .populate('createdBy', 'fullName')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Distribution.countDocuments(query)
    ]);

    return res.json({
      success: true,
      data: {
        distributions,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (err) {
    console.error('List distributions error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch distribution records.' });
  }
});

// POST /api/distributions - Record distribution entry (routine auto-recording)
router.post('/', async (req, res) => {
  try {
    const { quantity, areaId, date, notes, clientId, memberId: targetMemberId } = req.body;

    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) {
      return res.status(400).json({ success: false, error: 'Quantity must be at least 1 calendar.' });
    }

    // Check idempotency if clientId is provided
    if (clientId) {
      const existing = await Distribution.findOne({ clientId });
      if (existing) {
        return res.json({ success: true, data: existing, idempotent: true });
      }
    }

    let memberId = req.user._id;
    let teamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;

    // Admin/Usthad/Leader can record for a specific member
    if (['super_admin', 'usthad', 'team_leader'].includes(req.user.role) && targetMemberId) {
      if (isValidObjectId(targetMemberId)) {
        memberId = targetMemberId;
        // Lookup member's team
        const User = (await import('../models/User.js')).default;
        const targetUser = await User.findById(targetMemberId);
        if (targetUser && targetUser.teamId) {
          teamId = targetUser.teamId;
        }
      }
    }

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'User is not assigned to a team.' });
    }

    const distribution = await Distribution.create({
      memberId,
      teamId,
      areaId: areaId && isValidObjectId(areaId) ? areaId : null,
      quantity: qty,
      date: date ? new Date(date) : new Date(),
      notes: notes ? notes.trim() : '',
      clientId: clientId || undefined,
      createdBy: req.user._id,
      status: 'active'
    });

    await logAudit({
      entityType: 'distribution',
      entityId: distribution._id,
      action: 'create',
      newValues: { quantity: qty, areaId, teamId, memberId },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('distribution:new', {
        id: distribution._id,
        teamId,
        memberId,
        quantity: qty
      });
    }

    return res.status(201).json({ success: true, data: distribution });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern && err.keyPattern.clientId) {
      // Duplicate client ID handled gracefully
      const existing = await Distribution.findOne({ clientId: req.body.clientId });
      return res.json({ success: true, data: existing, idempotent: true });
    }
    console.error('Create distribution error:', err);
    return res.status(500).json({ success: false, error: 'Failed to record distribution.' });
  }
});

// PUT /api/distributions/:id/flag - Flag an entry for correction
router.put('/:id/flag', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid distribution ID.' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Reason for flagging is required.' });
    }

    const dist = await Distribution.findById(id);
    if (!dist) {
      return res.status(404).json({ success: false, error: 'Distribution record not found.' });
    }

    // Authorization: Super Admin, Usthad, or Team Leader of the member's team, or the member themselves
    if (req.user.role === 'team_leader') {
      const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      if (userTeamId !== dist.teamId.toString()) {
        return res.status(403).json({ success: false, error: 'Unauthorized.' });
      }
    } else if (req.user.role === 'team_member') {
      if (dist.memberId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, error: 'Unauthorized.' });
      }
    }

    dist.status = 'flagged';
    await dist.save();

    await Correction.create({
      entityType: 'distribution',
      entityId: dist._id,
      reason: reason.trim(),
      oldValues: { quantity: dist.quantity, areaId: dist.areaId, date: dist.date },
      requestedBy: req.user._id,
      status: 'pending'
    });

    await logAudit({
      entityType: 'distribution',
      entityId: dist._id,
      action: 'flag',
      newValues: { status: 'flagged', reason: reason.trim() },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const io = req.app.get('io');
    if (io) io.emit('entry:flagged', { entityType: 'distribution', id: dist._id });

    return res.json({ success: true, message: 'Distribution record flagged for review.' });
  } catch (err) {
    console.error('Flag distribution error:', err);
    return res.status(500).json({ success: false, error: 'Failed to flag record.' });
  }
});

// PUT /api/distributions/:id/correct - Resolve correction (Super admin, Usthad, or Team Leader)
router.put('/:id/correct', requireRole('super_admin', 'usthad', 'team_leader'), async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, areaId, date, notes } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid distribution ID.' });
    }

    const dist = await Distribution.findById(id);
    if (!dist) {
      return res.status(404).json({ success: false, error: 'Distribution record not found.' });
    }

    if (req.user.role === 'team_leader') {
      const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      if (userTeamId !== dist.teamId.toString()) {
        return res.status(403).json({ success: false, error: 'Unauthorized to correct records outside your team.' });
      }
    }

    const oldValues = dist.toObject();

    if (quantity !== undefined) {
      const qty = parseInt(quantity, 10);
      if (qty < 1) return res.status(400).json({ success: false, error: 'Quantity must be at least 1.' });
      dist.quantity = qty;
    }

    if (areaId !== undefined) dist.areaId = isValidObjectId(areaId) ? areaId : null;
    if (date !== undefined) dist.date = new Date(date);
    if (notes !== undefined) dist.notes = notes.trim();

    dist.status = 'corrected';
    await dist.save();

    await Correction.updateMany(
      { entityType: 'distribution', entityId: dist._id, status: 'pending' },
      {
        status: 'resolved',
        approvedBy: req.user._id,
        newValues: { quantity: dist.quantity, areaId: dist.areaId, date: dist.date },
        resolvedAt: new Date()
      }
    );

    await logAudit({
      entityType: 'distribution',
      entityId: dist._id,
      action: 'correct',
      oldValues: { quantity: oldValues.quantity, areaId: oldValues.areaId, date: oldValues.date },
      newValues: { quantity: dist.quantity, areaId: dist.areaId, date: dist.date, status: 'corrected' },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({ success: true, data: dist });
  } catch (err) {
    console.error('Correct distribution error:', err);
    return res.status(500).json({ success: false, error: 'Failed to apply correction.' });
  }
});

export default router;
