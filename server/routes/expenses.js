import express from 'express';
import Expense from '../models/Expense.js';
import { authMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();
const allowedCategories = ['printing', 'transport', 'food', 'communication', 'stationery', 'other'];

router.use(authMiddleware);

// GET /api/expenses - Role-based visibility
// Super Admin & Usthad: all expenses
// Team Leader: expenses for their team or self
// Team Member: expenses recorded by themselves
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const query = {};
    if (req.user.role === 'team_member') {
      query.createdBy = req.user._id;
    } else if (req.user.role === 'team_leader') {
      const leaderTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;
      if (leaderTeamId) {
        query.$or = [{ teamId: leaderTeamId }, { createdBy: req.user._id }];
      } else {
        query.createdBy = req.user._id;
      }
    }

    const [expenses, total] = await Promise.all([
      Expense.find(query)
        .populate('createdBy', 'fullName role')
        .populate('teamId', 'name')
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Expense.countDocuments(query)
    ]);

    return res.json({
      success: true,
      data: {
        expenses,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) }
      }
    });
  } catch (err) {
    console.error('List expenses error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch expenses.' });
  }
});

// POST /api/expenses - All authenticated roles can record valid expenses
router.post('/', async (req, res) => {
  try {
    const { category, description, amount, date, teamId, memberId } = req.body;
    const value = Number(amount);
    const expenseDate = date === undefined ? new Date() : new Date(date);

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ success: false, error: 'Select a valid expense category.' });
    }
    if (typeof description !== 'string' || !description.trim() || description.trim().length > 300) {
      return res.status(400).json({ success: false, error: 'Description is required and must be 300 characters or fewer.' });
    }
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ success: false, error: 'Expense amount must be greater than zero.' });
    }
    if (Number.isNaN(expenseDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Enter a valid expense date.' });
    }

    let assignedTeamId = teamId || null;
    let assignedMemberId = memberId || req.user._id;

    if (req.user.role === 'team_member') {
      assignedTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;
      assignedMemberId = req.user._id;
    } else if (req.user.role === 'team_leader') {
      assignedTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;
    }

    const expense = await Expense.create({
      category,
      description: description.trim(),
      amount: value,
      date: expenseDate,
      teamId: assignedTeamId,
      memberId: assignedMemberId,
      status: 'recorded',
      createdBy: req.user._id
    });

    await logAudit({
      entityType: 'expense',
      entityId: expense._id,
      action: 'create',
      newValues: {
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        date: expense.date,
        teamId: assignedTeamId,
        memberId: assignedMemberId
      },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    await expense.populate('createdBy', 'fullName role');
    return res.status(201).json({ success: true, data: expense });
  } catch (err) {
    console.error('Create expense error:', err);
    return res.status(500).json({ success: false, error: 'Failed to record expense.' });
  }
});

export default router;
