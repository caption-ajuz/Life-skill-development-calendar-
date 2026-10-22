import express from 'express';
import Collection from '../models/Collection.js';
import Correction from '../models/Correction.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { isValidObjectId } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/collections - List collections with filters & pagination
router.get('/', async (req, res) => {
  try {
    const { teamId, memberId, areaId, status, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const query = {};

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

    const [collections, total] = await Promise.all([
      Collection.find(query)
        .populate('memberId', 'fullName phone')
        .populate('teamId', 'name')
        .populate('areaId', 'name district')
        .populate('createdBy', 'fullName')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Collection.countDocuments(query)
    ]);

    return res.json({
      success: true,
      data: {
        collections,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (err) {
    console.error('List collections error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch collection records.' });
  }
});

// POST /api/collections - Record collection entry
router.post('/', async (req, res) => {
  try {
    const { amount, areaId, date, notes, clientId, memberId: targetMemberId, relatedDistributionId } = req.body;

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) {
      return res.status(400).json({ success: false, error: 'Amount must be a non-negative number.' });
    }

    if (clientId) {
      const existing = await Collection.findOne({ clientId });
      if (existing) {
        return res.json({ success: true, data: existing, idempotent: true });
      }
    }

    let memberId = req.user._id;
    let teamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;

    if (['super_admin', 'usthad', 'team_leader'].includes(req.user.role) && targetMemberId) {
      if (isValidObjectId(targetMemberId)) {
        memberId = targetMemberId;
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

    const collection = await Collection.create({
      memberId,
      teamId,
      areaId: areaId && isValidObjectId(areaId) ? areaId : null,
      amount: amt,
      date: date ? new Date(date) : new Date(),
      notes: notes ? notes.trim() : '',
      relatedDistributionId: relatedDistributionId && isValidObjectId(relatedDistributionId) ? relatedDistributionId : null,
      clientId: clientId || undefined,
      createdBy: req.user._id,
      status: 'active'
    });

    await logAudit({
      entityType: 'collection',
      entityId: collection._id,
      action: 'create',
      newValues: { amount: amt, areaId, teamId, memberId },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('collection:new', {
        id: collection._id,
        teamId,
        memberId,
        amount: amt
      });
    }

    return res.status(201).json({ success: true, data: collection });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern && err.keyPattern.clientId) {
      const existing = await Collection.findOne({ clientId: req.body.clientId });
      return res.json({ success: true, data: existing, idempotent: true });
    }
    console.error('Create collection error:', err);
    return res.status(500).json({ success: false, error: 'Failed to record collection.' });
  }
});

// PUT /api/collections/:id/flag
router.put('/:id/flag', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid collection ID.' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Reason for flagging is required.' });
    }

    const col = await Collection.findById(id);
    if (!col) {
      return res.status(404).json({ success: false, error: 'Collection record not found.' });
    }

    if (req.user.role === 'team_leader') {
      const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      if (userTeamId !== col.teamId.toString()) {
        return res.status(403).json({ success: false, error: 'Unauthorized.' });
      }
    } else if (req.user.role === 'team_member') {
      if (col.memberId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, error: 'Unauthorized.' });
      }
    }

    col.status = 'flagged';
    await col.save();

    await Correction.create({
      entityType: 'collection',
      entityId: col._id,
      reason: reason.trim(),
      oldValues: { amount: col.amount, areaId: col.areaId, date: col.date },
      requestedBy: req.user._id,
      status: 'pending'
    });

    await logAudit({
      entityType: 'collection',
      entityId: col._id,
      action: 'flag',
      newValues: { status: 'flagged', reason: reason.trim() },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const io = req.app.get('io');
    if (io) io.emit('entry:flagged', { entityType: 'collection', id: col._id });

    return res.json({ success: true, message: 'Collection record flagged for review.' });
  } catch (err) {
    console.error('Flag collection error:', err);
    return res.status(500).json({ success: false, error: 'Failed to flag record.' });
  }
});

// PUT /api/collections/:id/correct
router.put('/:id/correct', requireRole('super_admin', 'usthad', 'team_leader'), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, areaId, date, notes } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid collection ID.' });
    }

    const col = await Collection.findById(id);
    if (!col) {
      return res.status(404).json({ success: false, error: 'Collection record not found.' });
    }

    if (req.user.role === 'team_leader') {
      const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      if (userTeamId !== col.teamId.toString()) {
        return res.status(403).json({ success: false, error: 'Unauthorized to correct records outside your team.' });
      }
    }

    const oldValues = col.toObject();

    if (amount !== undefined) {
      const amt = parseFloat(amount);
      if (isNaN(amt) || amt < 0) return res.status(400).json({ success: false, error: 'Amount must be non-negative.' });
      col.amount = amt;
    }

    if (areaId !== undefined) col.areaId = isValidObjectId(areaId) ? areaId : null;
    if (date !== undefined) col.date = new Date(date);
    if (notes !== undefined) col.notes = notes.trim();

    col.status = 'corrected';
    await col.save();

    await Correction.updateMany(
      { entityType: 'collection', entityId: col._id, status: 'pending' },
      {
        status: 'resolved',
        approvedBy: req.user._id,
        newValues: { amount: col.amount, areaId: col.areaId, date: col.date },
        resolvedAt: new Date()
      }
    );

    await logAudit({
      entityType: 'collection',
      entityId: col._id,
      action: 'correct',
      oldValues: { amount: oldValues.amount, areaId: oldValues.areaId, date: oldValues.date },
      newValues: { amount: col.amount, areaId: col.areaId, date: col.date, status: 'corrected' },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({ success: true, data: col });
  } catch (err) {
    console.error('Correct collection error:', err);
    return res.status(500).json({ success: false, error: 'Failed to apply correction.' });
  }
});

export default router;
