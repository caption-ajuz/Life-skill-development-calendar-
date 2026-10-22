import express from 'express';
import mongoose from 'mongoose';
import Correction from '../models/Correction.js';
import Distribution from '../models/Distribution.js';
import Collection from '../models/Collection.js';
import MoneyTransfer from '../models/MoneyTransfer.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateRequired, isValidObjectId } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/corrections - List correction requests with role-based filtering
router.get('/', async (req, res) => {
  try {
    const { status, entityType, page = 1, limit = 50 } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (entityType && ['distribution', 'collection', 'transfer'].includes(entityType)) {
      query.entityType = entityType;
    }

    // Role-based visibility
    if (req.user.role === 'team_member') {
      query.requestedBy = req.user._id;
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [corrections, total] = await Promise.all([
      Correction.find(query)
        .populate('requestedBy', 'fullName username role teamId')
        .populate('approvedBy', 'fullName username role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Correction.countDocuments(query)
    ]);

    return res.json({
      success: true,
      data: {
        corrections,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (err) {
    console.error('List corrections error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch correction requests.' });
  }
});

// POST /api/corrections - Submit a correction request
router.post('/', async (req, res) => {
  try {
    const { entityType, entityId, reason, newValues } = req.body;

    const check = validateRequired(req.body, ['entityType', 'entityId', 'reason', 'newValues']);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: check.error });
    }

    if (!['distribution', 'collection', 'transfer'].includes(entityType)) {
      return res.status(400).json({ success: false, error: 'entityType must be distribution, collection, or transfer.' });
    }

    if (!isValidObjectId(entityId)) {
      return res.status(400).json({ success: false, error: 'Invalid entityId.' });
    }

    let existingEntity = null;
    let oldValues = null;

    if (entityType === 'distribution') {
      existingEntity = await Distribution.findById(entityId);
      if (existingEntity) {
        oldValues = {
          quantity: existingEntity.quantity,
          recipientName: existingEntity.recipientName,
          recipientPhone: existingEntity.recipientPhone,
          date: existingEntity.date
        };
      }
    } else if (entityType === 'collection') {
      existingEntity = await Collection.findById(entityId);
      if (existingEntity) {
        oldValues = {
          amount: existingEntity.amount,
          collectedFrom: existingEntity.collectedFrom,
          date: existingEntity.date
        };
      }
    } else if (entityType === 'transfer') {
      existingEntity = await MoneyTransfer.findById(entityId);
      if (existingEntity) {
        oldValues = {
          amount: existingEntity.amount,
          paymentMethod: existingEntity.paymentMethod,
          transferDate: existingEntity.transferDate
        };
      }
    }

    if (!existingEntity) {
      return res.status(404).json({ success: false, error: `Original ${entityType} record not found.` });
    }

    const correction = await Correction.create({
      entityType,
      entityId,
      reason: reason.trim(),
      oldValues: oldValues || req.body.oldValues || {},
      newValues,
      requestedBy: req.user._id,
      status: 'pending'
    });

    await logAudit({
      entityType: 'correction',
      entityId: correction._id,
      action: 'request_correction',
      newValues: { entityType, entityId, reason, newValues },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const populated = await Correction.findById(correction._id)
      .populate('requestedBy', 'fullName username role');

    return res.status(201).json({
      success: true,
      message: 'Correction request submitted for supervisor review.',
      data: populated
    });
  } catch (err) {
    console.error('Create correction error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create correction request.' });
  }
});

// PUT /api/corrections/:id/approve - Approve & apply correction (Super Admin or Usthad)
router.put('/:id/approve', requireRole('super_admin', 'usthad'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid correction ID.' });
    }

    const correction = await Correction.findById(id);
    if (!correction) {
      return res.status(404).json({ success: false, error: 'Correction request not found.' });
    }

    if (correction.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Correction is already ${correction.status}.` });
    }

    // Apply change to underlying record
    const { entityType, entityId, newValues } = correction;

    if (entityType === 'distribution') {
      const record = await Distribution.findById(entityId);
      if (record && newValues) {
        if (newValues.quantity !== undefined) record.quantity = Math.max(0, parseInt(newValues.quantity, 10));
        if (newValues.recipientName) record.recipientName = newValues.recipientName.trim();
        if (newValues.recipientPhone) record.recipientPhone = newValues.recipientPhone.trim();
        await record.save();
      }
    } else if (entityType === 'collection') {
      const record = await Collection.findById(entityId);
      if (record && newValues) {
        if (newValues.amount !== undefined) record.amount = Math.max(0, parseFloat(newValues.amount));
        if (newValues.collectedFrom) record.collectedFrom = newValues.collectedFrom.trim();
        await record.save();
      }
    } else if (entityType === 'transfer') {
      const record = await MoneyTransfer.findById(entityId);
      if (record && newValues) {
        if (newValues.amount !== undefined) record.amount = Math.max(0, parseFloat(newValues.amount));
        if (newValues.paymentMethod) record.paymentMethod = newValues.paymentMethod;
        await record.save();
      }
    }

    correction.status = 'resolved';
    correction.approvedBy = req.user._id;
    correction.resolvedAt = new Date();
    await correction.save();

    await logAudit({
      entityType: 'correction',
      entityId: correction._id,
      action: 'approve_correction',
      oldValues: correction.oldValues,
      newValues: correction.newValues,
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const populated = await Correction.findById(correction._id)
      .populate('requestedBy', 'fullName username role')
      .populate('approvedBy', 'fullName username role');

    return res.json({
      success: true,
      message: 'Correction approved and applied successfully.',
      data: populated
    });
  } catch (err) {
    console.error('Approve correction error:', err);
    return res.status(500).json({ success: false, error: 'Failed to approve correction request.' });
  }
});

// PUT /api/corrections/:id/reject - Reject correction (Super Admin or Usthad)
router.put('/:id/reject', requireRole('super_admin', 'usthad'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid correction ID.' });
    }

    const correction = await Correction.findById(id);
    if (!correction) {
      return res.status(404).json({ success: false, error: 'Correction request not found.' });
    }

    if (correction.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Correction is already ${correction.status}.` });
    }

    correction.status = 'rejected';
    correction.approvedBy = req.user._id;
    correction.resolvedAt = new Date();
    if (rejectionReason) {
      correction.reason = `${correction.reason} [Rejection Note: ${rejectionReason}]`;
    }
    await correction.save();

    await logAudit({
      entityType: 'correction',
      entityId: correction._id,
      action: 'reject_correction',
      newValues: { status: 'rejected', rejectionReason },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const populated = await Correction.findById(correction._id)
      .populate('requestedBy', 'fullName username role')
      .populate('approvedBy', 'fullName username role');

    return res.json({
      success: true,
      message: 'Correction request rejected.',
      data: populated
    });
  } catch (err) {
    console.error('Reject correction error:', err);
    return res.status(500).json({ success: false, error: 'Failed to reject correction request.' });
  }
});

export default router;
