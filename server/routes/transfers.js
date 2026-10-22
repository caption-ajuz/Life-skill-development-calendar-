import express from 'express';
import MoneyTransfer from '../models/MoneyTransfer.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { isValidObjectId } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/transfers - List transfers with role-based scoping
router.get('/', async (req, res) => {
  try {
    const { teamId, status, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const query = {};

    if (req.user.role === 'team_member') {
      query.fromUserId = req.user._id;
    } else if (req.user.role === 'team_leader') {
      const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;
      query.teamId = userTeamId;
    } else {
      if (teamId && isValidObjectId(teamId)) query.teamId = teamId;
    }

    if (status) query.status = status;

    if (dateFrom || dateTo) {
      query.transferDate = {};
      if (dateFrom) query.transferDate.$gte = new Date(dateFrom);
      if (dateTo) query.transferDate.$lte = new Date(dateTo);
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [transfers, total] = await Promise.all([
      MoneyTransfer.find(query)
        .populate('fromUserId', 'fullName phone role')
        .populate('teamId', 'name')
        .populate('confirmedBy', 'fullName')
        .sort({ transferDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      MoneyTransfer.countDocuments(query)
    ]);

    return res.json({
      success: true,
      data: {
        transfers,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (err) {
    console.error('List transfers error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch money transfers.' });
  }
});

// GET /api/transfers/pending - Pending transfers requiring confirmation (Super Admin & Usthad)
router.get('/pending', requireRole('super_admin', 'usthad'), async (req, res) => {
  try {
    const pending = await MoneyTransfer.find({
      status: { $in: ['pending', 'awaiting_confirmation'] }
    })
      .populate('fromUserId', 'fullName phone role')
      .populate('teamId', 'name')
      .sort({ transferDate: -1 });

    return res.json({ success: true, data: pending });
  } catch (err) {
    console.error('Get pending transfers error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch pending transfers.' });
  }
});

// POST /api/transfers - Record money handover
router.post('/', async (req, res) => {
  try {
    const { amount, toDescription, transferDate, notes, clientId, teamId: customTeamId } = req.body;

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ success: false, error: 'Transfer amount must be greater than 0.' });
    }

    if (!toDescription || !toDescription.trim()) {
      return res.status(400).json({ success: false, error: 'Please specify whom the money was handed to.' });
    }

    if (clientId) {
      const existing = await MoneyTransfer.findOne({ clientId });
      if (existing) {
        return res.json({ success: true, data: existing, idempotent: true });
      }
    }

    let teamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;
    if (['super_admin', 'usthad'].includes(req.user.role) && customTeamId && isValidObjectId(customTeamId)) {
      teamId = customTeamId;
    }

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Transfer requires a valid team association.' });
    }

    const transfer = await MoneyTransfer.create({
      fromUserId: req.user._id,
      toDescription: toDescription.trim(),
      teamId,
      amount: amt,
      transferDate: transferDate ? new Date(transferDate) : new Date(),
      status: 'awaiting_confirmation',
      notes: notes ? notes.trim() : '',
      clientId: clientId || undefined
    });

    await logAudit({
      entityType: 'money_transfer',
      entityId: transfer._id,
      action: 'create',
      newValues: { amount: amt, toDescription: transfer.toDescription, status: transfer.status },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('transfer:new', {
        id: transfer._id,
        teamId,
        amount: amt,
        from: req.user.fullName
      });
    }

    return res.status(201).json({ success: true, data: transfer });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern && err.keyPattern.clientId) {
      const existing = await MoneyTransfer.findOne({ clientId: req.body.clientId });
      return res.json({ success: true, data: existing, idempotent: true });
    }
    console.error('Create transfer error:', err);
    return res.status(500).json({ success: false, error: 'Failed to record money transfer.' });
  }
});

// PUT /api/transfers/:id/confirm - Confirm money transfer (Super Admin or Usthad ONLY)
router.put('/:id/confirm', requireRole('super_admin', 'usthad'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid transfer ID.' });
    }

    const transfer = await MoneyTransfer.findById(id);
    if (!transfer) {
      return res.status(404).json({ success: false, error: 'Transfer record not found.' });
    }

    if (transfer.status === 'confirmed') {
      return res.status(400).json({ success: false, error: 'Transfer is already confirmed.' });
    }

    const oldStatus = transfer.status;
    transfer.status = 'confirmed';
    transfer.confirmedBy = req.user._id;
    transfer.confirmedAt = new Date();
    await transfer.save();

    await logAudit({
      entityType: 'money_transfer',
      entityId: transfer._id,
      action: 'confirm',
      oldValues: { status: oldStatus },
      newValues: { status: 'confirmed', confirmedBy: req.user._id, confirmedAt: transfer.confirmedAt },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('transfer:confirmed', {
        id: transfer._id,
        teamId: transfer.teamId,
        amount: transfer.amount
      });
    }

    return res.json({ success: true, data: transfer, message: 'Money transfer confirmed successfully.' });
  } catch (err) {
    console.error('Confirm transfer error:', err);
    return res.status(500).json({ success: false, error: 'Failed to confirm money transfer.' });
  }
});

// PUT /api/transfers/:id/dispute - Dispute money transfer (Super Admin, Usthad, or Team Leader)
router.put('/:id/dispute', requireRole('super_admin', 'usthad', 'team_leader'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid transfer ID.' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Reason for dispute is required.' });
    }

    const transfer = await MoneyTransfer.findById(id);
    if (!transfer) {
      return res.status(404).json({ success: false, error: 'Transfer record not found.' });
    }

    const oldStatus = transfer.status;
    transfer.status = 'disputed';
    transfer.disputeReason = reason.trim();
    await transfer.save();

    await logAudit({
      entityType: 'money_transfer',
      entityId: transfer._id,
      action: 'dispute',
      oldValues: { status: oldStatus },
      newValues: { status: 'disputed', disputeReason: transfer.disputeReason },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({ success: true, data: transfer, message: 'Transfer marked as disputed.' });
  } catch (err) {
    console.error('Dispute transfer error:', err);
    return res.status(500).json({ success: false, error: 'Failed to dispute transfer.' });
  }
});

export default router;
