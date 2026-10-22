import express from 'express';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Distribution from '../models/Distribution.js';
import Collection from '../models/Collection.js';
import StockAllocation from '../models/StockAllocation.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validateRequired, isValidObjectId } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/teams - All users can list teams (basic metadata)
router.get('/', async (req, res) => {
  try {
    const teams = await Team.find({ isActive: true }).sort({ name: 1 });

    // Aggregate statistics per team
    const teamStats = await Promise.all(
      teams.map(async (t) => {
        const teamId = t._id;

        const [memberCount, distAgg, colAgg, stockAlloc] = await Promise.all([
          User.countDocuments({ teamId, isActive: true }),
          Distribution.aggregate([
            { $match: { teamId, status: 'active' } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          Collection.aggregate([
            { $match: { teamId, status: 'active' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          StockAllocation.findOne({ teamId, memberId: null })
        ]);

        return {
          _id: t._id,
          name: t.name,
          description: t.description,
          isActive: t.isActive,
          createdAt: t.createdAt,
          memberCount,
          totalDistributed: distAgg[0] ? distAgg[0].total : 0,
          totalCollected: colAgg[0] ? colAgg[0].total : 0,
          allocatedStock: stockAlloc ? stockAlloc.quantity : 0
        };
      })
    );

    return res.json({ success: true, data: teamStats });
  } catch (err) {
    console.error('List teams error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch teams.' });
  }
});

// POST /api/teams - Super admin only
router.post('/', requireRole('super_admin'), async (req, res) => {
  try {
    const { name, description } = req.body;
    const check = validateRequired(req.body, ['name']);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: check.error });
    }

    const cleanName = name.trim();
    const existing = await Team.findOne({ name: cleanName });
    if (existing) {
      return res.status(400).json({ success: false, error: 'A team with this name already exists.' });
    }

    const team = await Team.create({
      name: cleanName,
      description: description ? description.trim() : ''
    });

    await logAudit({
      entityType: 'team',
      entityId: team._id,
      action: 'create',
      newValues: { name: team.name },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.status(201).json({ success: true, data: team });
  } catch (err) {
    console.error('Create team error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create team.' });
  }
});

// GET /api/teams/:id - View team details + members + stats
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid team ID.' });
    }

    // Team Leader/Member can only view own team
    if (['team_leader', 'team_member'].includes(req.user.role)) {
      const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      if (userTeamId !== id) {
        return res.status(403).json({ success: false, error: 'Access denied: You may only view your own team.' });
      }
    }

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const members = await User.find({ teamId: id, isActive: true })
      .select('-passwordHash')
      .sort({ role: 1, fullName: 1 });

    const memberStats = await Promise.all(
      members.map(async (m) => {
        const [distAgg, colAgg, alloc] = await Promise.all([
          Distribution.aggregate([
            { $match: { memberId: m._id, status: 'active' } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          Collection.aggregate([
            { $match: { memberId: m._id, status: 'active' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          StockAllocation.findOne({ teamId: id, memberId: m._id })
        ]);

        return {
          ...m.toJSON(),
          allocatedStock: alloc ? alloc.quantity : 0,
          totalDistributed: distAgg[0] ? distAgg[0].total : 0,
          totalCollected: colAgg[0] ? colAgg[0].total : 0
        };
      })
    );

    const teamStock = await StockAllocation.findOne({ teamId: id, memberId: null });

    return res.json({
      success: true,
      data: {
        team,
        stockAllocation: teamStock ? teamStock.quantity : 0,
        members: memberStats
      }
    });
  } catch (err) {
    console.error('Get team detail error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch team details.' });
  }
});

// PUT /api/teams/:id - Super admin only
router.put('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid team ID.' });
    }

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const { name, description, isActive } = req.body;
    const oldValues = { name: team.name, description: team.description, isActive: team.isActive };

    if (name) team.name = name.trim();
    if (description !== undefined) team.description = description.trim();
    if (isActive !== undefined) team.isActive = Boolean(isActive);

    await team.save();

    await logAudit({
      entityType: 'team',
      entityId: team._id,
      action: 'update',
      oldValues,
      newValues: { name: team.name, description: team.description, isActive: team.isActive },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({ success: true, data: team });
  } catch (err) {
    console.error('Update team error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update team.' });
  }
});

export default router;
