import express from 'express';
import CampaignConfig from '../models/CampaignConfig.js';
import StockAllocation from '../models/StockAllocation.js';
import Distribution from '../models/Distribution.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { isValidObjectId } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

router.use(authMiddleware);

// Helper to get or create campaign config
async function getOrCreateCampaignConfig() {
  let config = await CampaignConfig.findOne();
  if (!config) {
    config = await CampaignConfig.create({
      totalStock: 5000,
      calendarPrice: 100,
      initialInvestment: 25000,
      printingCost: 50000,
      campaignYear: new Date().getFullYear()
    });
  }
  return config;
}

// GET /api/stock/campaign - Get campaign config
router.get('/campaign', async (req, res) => {
  try {
    const config = await getOrCreateCampaignConfig();
    return res.json({ success: true, data: config });
  } catch (err) {
    console.error('Get campaign config error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch campaign configuration.' });
  }
});

// PUT /api/stock/campaign - Update campaign config (Super admin only)
router.put('/campaign', requireRole('super_admin'), async (req, res) => {
  try {
    const { totalStock, calendarPrice, initialInvestment, printingCost, campaignYear, notes } = req.body;
    let config = await getOrCreateCampaignConfig();

    const oldValues = config.toObject();

    if (totalStock !== undefined) config.totalStock = Math.max(0, parseInt(totalStock, 10));
    if (calendarPrice !== undefined) config.calendarPrice = Math.max(0, parseFloat(calendarPrice));
    if (initialInvestment !== undefined) config.initialInvestment = Math.max(0, parseFloat(initialInvestment));
    if (printingCost !== undefined) config.printingCost = Math.max(0, parseFloat(printingCost));
    if (campaignYear !== undefined) config.campaignYear = parseInt(campaignYear, 10);
    if (notes !== undefined) config.notes = notes;

    await config.save();

    await logAudit({
      entityType: 'campaign_config',
      entityId: config._id,
      action: 'update',
      oldValues,
      newValues: config.toObject(),
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    // Notify connected clients via Socket.io if available
    const io = req.app.get('io');
    if (io) io.emit('stock:updated', { totalStock: config.totalStock });

    return res.json({ success: true, data: config });
  } catch (err) {
    console.error('Update campaign config error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update campaign configuration.' });
  }
});

// GET /api/stock/allocations - List allocations
router.get('/allocations', async (req, res) => {
  try {
    const { teamId } = req.query;
    const query = {};

    if (['team_leader', 'team_member'].includes(req.user.role)) {
      const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      query.teamId = userTeamId;
    } else if (teamId && isValidObjectId(teamId)) {
      query.teamId = teamId;
    }

    const allocations = await StockAllocation.find(query)
      .populate('teamId', 'name')
      .populate('memberId', 'fullName role')
      .populate('allocatedBy', 'fullName')
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: allocations });
  } catch (err) {
    console.error('List allocations error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch allocations.' });
  }
});

// POST /api/stock/allocate-team - Allocate stock to a team (Super admin only)
router.post('/allocate-team', requireRole('super_admin'), async (req, res) => {
  try {
    const { teamId, quantity, notes } = req.body;

    if (!teamId || !isValidObjectId(teamId)) {
      return res.status(400).json({ success: false, error: 'Valid team ID is required.' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({ success: false, error: 'Quantity must be a non-negative number.' });
    }

    const [config, team, otherAllocations] = await Promise.all([
      getOrCreateCampaignConfig(),
      Team.findById(teamId),
      StockAllocation.find({ teamId: { $ne: teamId }, memberId: null })
    ]);

    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const otherTeamsTotal = otherAllocations.reduce((sum, a) => sum + a.quantity, 0);
    const newTotalAllocated = otherTeamsTotal + qty;

    if (newTotalAllocated > config.totalStock) {
      return res.status(400).json({
        success: false,
        error: `Over-allocation warning: Total allocated (${newTotalAllocated}) would exceed campaign stock (${config.totalStock}). Available: ${Math.max(0, config.totalStock - otherTeamsTotal)}.`
      });
    }

    const allocation = await StockAllocation.findOneAndUpdate(
      { teamId, memberId: null },
      {
        teamId,
        memberId: null,
        quantity: qty,
        allocatedBy: req.user._id,
        notes: notes || ''
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await logAudit({
      entityType: 'stock_allocation',
      entityId: allocation._id,
      action: 'allocate',
      newValues: { teamId, quantity: qty, level: 'team' },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const io = req.app.get('io');
    if (io) io.emit('stock:updated', { teamId, quantity: qty });

    return res.json({ success: true, data: allocation });
  } catch (err) {
    console.error('Allocate to team error:', err);
    return res.status(500).json({ success: false, error: 'Failed to allocate stock to team.' });
  }
});

// POST /api/stock/allocate-member - Allocate stock to team member (Super Admin or Team Leader)
router.post('/allocate-member', requireRole('super_admin', 'team_leader'), async (req, res) => {
  try {
    const { memberId, quantity, notes } = req.body;

    if (!memberId || !isValidObjectId(memberId)) {
      return res.status(400).json({ success: false, error: 'Valid member ID is required.' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({ success: false, error: 'Quantity must be a non-negative number.' });
    }

    const member = await User.findById(memberId);
    if (!member) {
      return res.status(404).json({ success: false, error: 'Member not found.' });
    }

    const memberTeamId = member.teamId ? member.teamId.toString() : null;
    if (!memberTeamId) {
      return res.status(400).json({ success: false, error: 'Member is not assigned to any team.' });
    }

    // Team Leader can only allocate to their own team members
    if (req.user.role === 'team_leader') {
      const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      if (userTeamId !== memberTeamId) {
        return res.status(403).json({ success: false, error: 'You may only allocate stock to members of your own team.' });
      }
    }

    // Check team stock limit
    const [teamAllocation, otherMembersAlloc] = await Promise.all([
      StockAllocation.findOne({ teamId: memberTeamId, memberId: null }),
      StockAllocation.find({ teamId: memberTeamId, memberId: { $ne: null, $nin: [member._id] } })
    ]);

    const teamTotalStock = teamAllocation ? teamAllocation.quantity : 0;
    const otherMembersTotal = otherMembersAlloc.reduce((sum, a) => sum + a.quantity, 0);
    const newMemberAllocTotal = otherMembersTotal + qty;

    if (newMemberAllocTotal > teamTotalStock) {
      return res.status(400).json({
        success: false,
        error: `Cannot allocate ${qty} calendars. Team total stock is ${teamTotalStock}, already allocated to others: ${otherMembersTotal}. Maximum available: ${Math.max(0, teamTotalStock - otherMembersTotal)}.`
      });
    }

    const allocation = await StockAllocation.findOneAndUpdate(
      { teamId: memberTeamId, memberId: member._id },
      {
        teamId: memberTeamId,
        memberId: member._id,
        quantity: qty,
        allocatedBy: req.user._id,
        notes: notes || ''
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await logAudit({
      entityType: 'stock_allocation',
      entityId: allocation._id,
      action: 'allocate',
      newValues: { teamId: memberTeamId, memberId: member._id, quantity: qty, level: 'member' },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const io = req.app.get('io');
    if (io) io.emit('stock:updated', { memberId: member._id, quantity: qty });

    return res.json({ success: true, data: allocation });
  } catch (err) {
    console.error('Allocate to member error:', err);
    return res.status(500).json({ success: false, error: 'Failed to allocate stock to member.' });
  }
});

// GET /api/stock/summary - Stock overview summary
router.get('/summary', async (req, res) => {
  try {
    const config = await getOrCreateCampaignConfig();

    const [teamAllocAgg, memberAllocAgg, distAgg] = await Promise.all([
      StockAllocation.aggregate([
        { $match: { memberId: null } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      StockAllocation.aggregate([
        { $match: { memberId: { $ne: null } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Distribution.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ])
    ]);

    const totalAllocatedToTeams = teamAllocAgg[0] ? teamAllocAgg[0].total : 0;
    const totalAllocatedToMembers = memberAllocAgg[0] ? memberAllocAgg[0].total : 0;
    const totalDistributed = distAgg[0] ? distAgg[0].total : 0;

    return res.json({
      success: true,
      data: {
        totalCampaignStock: config.totalStock,
        calendarPrice: config.calendarPrice,
        totalAllocatedToTeams,
        unallocatedCampaignStock: Math.max(0, config.totalStock - totalAllocatedToTeams),
        totalAllocatedToMembers,
        unallocatedTeamStock: Math.max(0, totalAllocatedToTeams - totalAllocatedToMembers),
        totalDistributed,
        remainingWithMembers: Math.max(0, totalAllocatedToMembers - totalDistributed)
      }
    });
  } catch (err) {
    console.error('Stock summary error:', err);
    return res.status(500).json({ success: false, error: 'Failed to compute stock summary.' });
  }
});

// GET /api/stock/reconciliation - Comprehensive stock reconciliation audit
router.get('/reconciliation', requireRole('super_admin', 'usthad'), async (req, res) => {
  try {
    const config = await getOrCreateCampaignConfig();

    const [teamAllocAgg, memberAllocAgg, distAgg, teams] = await Promise.all([
      StockAllocation.aggregate([
        { $match: { memberId: null } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      StockAllocation.aggregate([
        { $match: { memberId: { $ne: null } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Distribution.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Team.find({ isActive: true }).select('name')
    ]);

    const campaignStock = config.totalStock;
    const allocatedToTeams = teamAllocAgg[0] ? teamAllocAgg[0].total : 0;
    const unallocatedAtCentral = Math.max(0, campaignStock - allocatedToTeams);
    const allocatedToMembers = memberAllocAgg[0] ? memberAllocAgg[0].total : 0;
    const unallocatedAtTeams = Math.max(0, allocatedToTeams - allocatedToMembers);
    const totalDistributed = distAgg[0] ? distAgg[0].total : 0;
    const remainingWithMembers = Math.max(0, allocatedToMembers - totalDistributed);

    const accountedStock = unallocatedAtCentral + unallocatedAtTeams + remainingWithMembers + totalDistributed;
    const variance = campaignStock - accountedStock;

    // Team-level breakdown
    const teamBreakdowns = await Promise.all(
      teams.map(async (t) => {
        const [teamAlloc, memberAllocs, teamDists] = await Promise.all([
          StockAllocation.findOne({ teamId: t._id, memberId: null }),
          StockAllocation.aggregate([
            { $match: { teamId: t._id, memberId: { $ne: null } } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          Distribution.aggregate([
            { $match: { teamId: t._id, status: 'active' } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ])
        ]);

        const teamAllocQty = teamAlloc ? teamAlloc.quantity : 0;
        const memberAllocQty = memberAllocs[0] ? memberAllocs[0].total : 0;
        const distQty = teamDists[0] ? teamDists[0].total : 0;

        return {
          teamId: t._id,
          teamName: t.name,
          allocatedToTeam: teamAllocQty,
          allocatedToMembers: memberAllocQty,
          unallocatedInTeam: Math.max(0, teamAllocQty - memberAllocQty),
          distributed: distQty,
          remainingWithMembers: Math.max(0, memberAllocQty - distQty),
          variance: teamAllocQty - (Math.max(0, teamAllocQty - memberAllocQty) + Math.max(0, memberAllocQty - distQty) + distQty)
        };
      })
    );

    return res.json({
      success: true,
      data: {
        campaignStock,
        allocatedToTeams,
        unallocatedAtCentral,
        allocatedToMembers,
        unallocatedAtTeams,
        totalDistributed,
        remainingWithMembers,
        accountedStock,
        variance,
        reconciled: variance === 0,
        calendarPrice: config.calendarPrice,
        expectedGrossRevenue: totalDistributed * config.calendarPrice,
        teams: teamBreakdowns
      }
    });
  } catch (err) {
    console.error('Reconciliation error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate stock reconciliation.' });
  }
});

export default router;
