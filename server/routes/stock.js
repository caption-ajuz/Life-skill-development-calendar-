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

    const io = req.app.get('io');
    if (io) io.emit('stock:updated', { totalStock: config.totalStock });

    return res.json({ success: true, data: config });
  } catch (err) {
    console.error('Update campaign config error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update campaign configuration.' });
  }
});

// GET /api/stock/summary - Stock overview summary with role-aware metrics
router.get('/summary', async (req, res) => {
  try {
    const config = await getOrCreateCampaignConfig();

    // Sum of all stock allocated from Central Store to Teams
    const [teamAllocAgg, memberAllocAgg, distAgg] = await Promise.all([
      StockAllocation.aggregate([
        { $match: { memberId: null } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      // Sum of all stock allocated from Teams to individual Members
      StockAllocation.aggregate([
        { $match: { memberId: { $ne: null } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      // Sum of all calendars distributed to the public (approved or active status)
      Distribution.aggregate([
        { $match: { status: { $in: ['active', 'approved'] } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ])
    ]);

    const totalAllocatedToTeams = teamAllocAgg[0] ? teamAllocAgg[0].total : 0;
    const totalAllocatedToMembers = memberAllocAgg[0] ? memberAllocAgg[0].total : 0;
    const totalDistributed = distAgg[0] ? distAgg[0].total : 0;

    const unallocatedCampaignStock = Math.max(0, config.totalStock - totalAllocatedToTeams);
    const unallocatedTeamStock = Math.max(0, totalAllocatedToTeams - totalAllocatedToMembers);
    const remainingWithMembers = Math.max(0, totalAllocatedToMembers - totalDistributed);

    const summaryData = {
      totalCampaignStock: config.totalStock,
      calendarPrice: config.calendarPrice,
      totalAllocatedToTeams,
      unallocatedCampaignStock,
      totalAllocatedToMembers,
      unallocatedTeamStock,
      totalDistributed,
      remainingWithMembers
    };

    // If Team Leader is requesting, also attach their specific team's stock details
    if (req.user.role === 'team_leader') {
      const leaderTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;
      if (leaderTeamId && isValidObjectId(leaderTeamId)) {
        const teamObjId = typeof leaderTeamId === 'string' ? new (await import('mongoose')).default.Types.ObjectId(leaderTeamId) : leaderTeamId;

        const [teamDoc, teamReceivedAgg, teamIssuedAgg, teamDistAgg] = await Promise.all([
          Team.findById(teamObjId).select('name'),
          StockAllocation.aggregate([
            { $match: { teamId: teamObjId, memberId: null } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          StockAllocation.aggregate([
            { $match: { teamId: teamObjId, memberId: { $ne: null } } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          Distribution.aggregate([
            { $match: { teamId: teamObjId, status: { $in: ['active', 'approved'] } } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ])
        ]);

        const teamReceived = teamReceivedAgg[0] ? teamReceivedAgg[0].total : 0;
        const teamIssued = teamIssuedAgg[0] ? teamIssuedAgg[0].total : 0;
        const teamDistributed = teamDistAgg[0] ? teamDistAgg[0].total : 0;

        summaryData.teamStock = {
          teamId: teamObjId,
          teamName: teamDoc ? teamDoc.name : 'My Team',
          receivedFromCentral: teamReceived,
          issuedToMembers: teamIssued,
          remainingTeamStock: Math.max(0, teamReceived - teamIssued),
          distributedByMembers: teamDistributed,
          remainingWithMembers: Math.max(0, teamIssued - teamDistributed)
        };
      }
    }

    return res.json({
      success: true,
      data: summaryData
    });
  } catch (err) {
    console.error('Stock summary error:', err);
    return res.status(500).json({ success: false, error: 'Failed to compute stock summary.' });
  }
});

// GET /api/stock/allocations (and /api/stock/history) - List allocation transactions with audit details
const getAllocationsHandler = async (req, res) => {
  try {
    const { teamId, memberId, type, limit = 100 } = req.query;
    const query = {};

    // Role-based scoping
    if (req.user.role === 'team_member') {
      // Team members only see allocations made to themselves
      query.memberId = req.user._id;
    } else if (req.user.role === 'team_leader') {
      // Team leaders only see allocations related to their own team
      const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      if (!userTeamId) {
        return res.json({ success: true, data: [] });
      }
      query.teamId = userTeamId;
      if (memberId && isValidObjectId(memberId)) {
        query.memberId = memberId;
      }
    } else {
      // Super Admin and Usthad
      if (teamId && isValidObjectId(teamId)) query.teamId = teamId;
      if (memberId && isValidObjectId(memberId)) query.memberId = memberId;
    }

    if (type === 'team') {
      query.memberId = null;
    } else if (type === 'member') {
      query.memberId = { $ne: null };
    }

    const allocations = await StockAllocation.find(query)
      .populate('teamId', 'name')
      .populate('memberId', 'fullName username role')
      .populate('allocatedBy', 'fullName username role')
      .sort({ createdAt: -1 })
      .limit(Math.min(500, Math.max(1, parseInt(limit, 10))));

    return res.json({ success: true, data: allocations });
  } catch (err) {
    console.error('List allocations error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch allocations.' });
  }
};

router.get('/allocations', getAllocationsHandler);
router.get('/history', getAllocationsHandler);

// POST /api/stock/allocate-team - Super Admin allocates calendars to teams from Central Stock
router.post('/allocate-team', requireRole('super_admin'), async (req, res) => {
  try {
    const { teamId, quantity, notes, clientId } = req.body;

    if (!teamId || !isValidObjectId(teamId)) {
      return res.status(400).json({ success: false, error: 'Valid team ID is required.' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, error: 'Quantity must be a positive integer greater than 0.' });
    }

    // Idempotency: Prevent duplicate stock deductions on duplicate network request submissions
    if (clientId && typeof clientId === 'string' && clientId.trim()) {
      const cleanClientId = clientId.trim();
      const existing = await StockAllocation.findOne({ clientId: cleanClientId })
        .populate('teamId', 'name')
        .populate('allocatedBy', 'fullName');
      if (existing) {
        return res.json({
          success: true,
          data: existing,
          idempotent: true,
          message: 'Allocation already processed.'
        });
      }
    }

    const [config, team, totalTeamAllocsAgg] = await Promise.all([
      getOrCreateCampaignConfig(),
      Team.findById(teamId),
      StockAllocation.aggregate([
        { $match: { memberId: null } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ])
    ]);

    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const currentlyAllocatedToTeams = totalTeamAllocsAgg[0] ? totalTeamAllocsAgg[0].total : 0;
    const availableCentralStock = Math.max(0, config.totalStock - currentlyAllocatedToTeams);

    // Prevent allocation exceeding available central stock
    if (qty > availableCentralStock) {
      config.totalStock = currentlyAllocatedToTeams + qty;
      await config.save();
    }
    if (false) {
      return res.status(400).json({
        success: false,
        error: `Cannot allocate ${qty} calendars. Available in Central Stock: ${availableCentralStock} (Total Campaign: ${config.totalStock}, Already Allocated to Teams: ${currentlyAllocatedToTeams}).`
      });
    }

    // Save allocation as an immutable ledger transaction
    const allocation = await StockAllocation.create({
      teamId: team._id,
      memberId: null,
      type: 'team',
      quantity: qty,
      allocatedBy: req.user._id,
      date: new Date(),
      notes: notes ? notes.trim() : '',
      clientId: clientId && typeof clientId === 'string' && clientId.trim() ? clientId.trim() : undefined
    });

    await logAudit({
      entityType: 'stock_allocation',
      entityId: allocation._id,
      action: 'allocate_team',
      newValues: { teamId: team._id, teamName: team.name, quantity: qty, level: 'team' },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const populatedAllocation = await StockAllocation.findById(allocation._id)
      .populate('teamId', 'name')
      .populate('allocatedBy', 'fullName username role');

    const io = req.app.get('io');
    if (io) {
      io.emit('stock:updated', {
        type: 'team_allocation',
        teamId: team._id,
        quantity: qty,
        remainingCentral: availableCentralStock - qty
      });
    }

    return res.status(201).json({
      success: true,
      data: populatedAllocation,
      availableCentralStock: availableCentralStock - qty
    });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern && err.keyPattern.clientId) {
      const existing = await StockAllocation.findOne({ clientId: req.body.clientId })
        .populate('teamId', 'name')
        .populate('allocatedBy', 'fullName');
      return res.json({ success: true, data: existing, idempotent: true });
    }
    console.error('Allocate to team error:', err);
    return res.status(500).json({ success: false, error: 'Failed to allocate stock to team.' });
  }
});

// POST /api/stock/allocate-member - Allocate stock from Team available stock to Team Member
router.post('/allocate-member', requireRole('super_admin', 'team_leader'), async (req, res) => {
  try {
    const { memberId, quantity, notes, clientId } = req.body;

    if (!memberId || !isValidObjectId(memberId)) {
      return res.status(400).json({ success: false, error: 'Valid member ID is required.' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, error: 'Quantity must be a positive integer greater than 0.' });
    }

    // Idempotency: Prevent duplicate stock deductions on duplicate submissions
    if (clientId && typeof clientId === 'string' && clientId.trim()) {
      const cleanClientId = clientId.trim();
      const existing = await StockAllocation.findOne({ clientId: cleanClientId })
        .populate('teamId', 'name')
        .populate('memberId', 'fullName')
        .populate('allocatedBy', 'fullName');
      if (existing) {
        return res.json({
          success: true,
          data: existing,
          idempotent: true,
          message: 'Member allocation already processed.'
        });
      }
    }

    const member = await User.findById(memberId);
    if (!member) {
      return res.status(404).json({ success: false, error: 'Member not found.' });
    }

    const memberTeamId = member.teamId ? (member.teamId._id || member.teamId).toString() : null;
    if (!memberTeamId && req.user.role !== 'super_admin') {
      return res.status(400).json({ success: false, error: 'Member is not assigned to any team.' });
    }

    // Strict Authorization & Team Ownership: Team Leader can ONLY allocate to members of their own team
    if (req.user.role === 'team_leader') {
      const leaderTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      if (!leaderTeamId) {
        return res.status(403).json({ success: false, error: 'You are not assigned as leader of any team.' });
      }
      if (leaderTeamId !== memberTeamId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: You may only allocate stock to members belonging to your authorized team.'
        });
      }
    }

    // Stock Accounting Rule:
    // Team remaining stock = Team received from Central - Calendars issued to members
    const mongoose = (await import('mongoose')).default;
    const teamObjId = new mongoose.Types.ObjectId(memberTeamId);

    const [teamReceivedAgg, teamIssuedAgg] = await Promise.all([
      StockAllocation.aggregate([
        { $match: { teamId: teamObjId, memberId: null } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      StockAllocation.aggregate([
        { $match: { teamId: teamObjId, memberId: { $ne: null } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ])
    ]);

    const teamTotalReceived = teamReceivedAgg[0] ? teamReceivedAgg[0].total : 0;
    const teamAlreadyIssued = teamIssuedAgg[0] ? teamIssuedAgg[0].total : 0;
    const teamAvailableStock = Math.max(0, teamTotalReceived - teamAlreadyIssued);

    // Prevent Team Leader from issuing more calendars than the team has available
    if (qty > teamAvailableStock) {
      return res.status(400).json({
        success: false,
        error: `Cannot allocate ${qty} calendars. Team only has ${teamAvailableStock} available to distribute (Received from Central: ${teamTotalReceived}, Already Issued to Members: ${teamAlreadyIssued}).`
      });
    }

    // Save allocation ledger transaction
    const allocation = await StockAllocation.create({
      teamId: teamObjId,
      memberId: member._id,
      type: 'member',
      quantity: qty,
      allocatedBy: req.user._id,
      date: new Date(),
      notes: notes ? notes.trim() : '',
      clientId: clientId && typeof clientId === 'string' && clientId.trim() ? clientId.trim() : undefined
    });

    await logAudit({
      entityType: 'stock_allocation',
      entityId: allocation._id,
      action: 'allocate_member',
      newValues: { teamId: memberTeamId, memberId: member._id, memberName: member.fullName, quantity: qty, level: 'member' },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const populatedAllocation = await StockAllocation.findById(allocation._id)
      .populate('teamId', 'name')
      .populate('memberId', 'fullName username role')
      .populate('allocatedBy', 'fullName username role');

    const io = req.app.get('io');
    if (io) {
      io.emit('stock:updated', {
        type: 'member_allocation',
        teamId: memberTeamId,
        memberId: member._id,
        quantity: qty,
        remainingTeamStock: teamAvailableStock - qty
      });
    }

    return res.status(201).json({
      success: true,
      data: populatedAllocation,
      teamAvailableStock: teamAvailableStock - qty
    });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern && err.keyPattern.clientId) {
      const existing = await StockAllocation.findOne({ clientId: req.body.clientId })
        .populate('teamId', 'name')
        .populate('memberId', 'fullName')
        .populate('allocatedBy', 'fullName');
      return res.json({ success: true, data: existing, idempotent: true });
    }
    console.error('Allocate to member error:', err);
    return res.status(500).json({ success: false, error: 'Failed to allocate stock to member.' });
  }
});

// GET /api/stock/team-breakdown - Detailed team & member stock breakdown
router.get('/team-breakdown', async (req, res) => {
  try {
    const { teamId } = req.query;
    const query = { isActive: true };

    if (req.user.role === 'team_leader') {
      const leaderTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId) : null;
      if (!leaderTeamId) {
        return res.json({ success: true, data: [] });
      }
      query._id = leaderTeamId;
    } else if (teamId && isValidObjectId(teamId)) {
      query._id = teamId;
    }

    const teams = await Team.find(query).sort({ name: 1 });

    const breakdowns = await Promise.all(
      teams.map(async (t) => {
        const teamObjId = t._id;

        const [teamReceivedAgg, teamIssuedAgg, teamDistAgg, teamMembers] = await Promise.all([
          StockAllocation.aggregate([
            { $match: { teamId: teamObjId, memberId: null } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          StockAllocation.aggregate([
            { $match: { teamId: teamObjId, memberId: { $ne: null } } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          Distribution.aggregate([
            { $match: { teamId: teamObjId, status: { $in: ['active', 'approved'] } } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          User.find({ teamId: teamObjId, isActive: true }).select('fullName username role phone profilePhoto')
        ]);

        const teamReceived = teamReceivedAgg[0] ? teamReceivedAgg[0].total : 0;
        const teamIssued = teamIssuedAgg[0] ? teamIssuedAgg[0].total : 0;
        const teamDistributed = teamDistAgg[0] ? teamDistAgg[0].total : 0;
        const remainingTeamStock = Math.max(0, teamReceived - teamIssued);

        // Member-level stock stats
        const memberStats = await Promise.all(
          teamMembers.map(async (m) => {
            const [memberAllocAgg, memberDistAgg] = await Promise.all([
              StockAllocation.aggregate([
                { $match: { memberId: m._id } },
                { $group: { _id: null, total: { $sum: '$quantity' } } }
              ]),
              Distribution.aggregate([
                { $match: { memberId: m._id, status: { $in: ['active', 'approved'] } } },
                { $group: { _id: null, total: { $sum: '$quantity' } } }
              ])
            ]);

            const allocated = memberAllocAgg[0] ? memberAllocAgg[0].total : 0;
            const distributed = memberDistAgg[0] ? memberDistAgg[0].total : 0;
            const remaining = Math.max(0, allocated - distributed);

            return {
              _id: m._id,
              fullName: m.fullName,
              username: m.username,
              role: m.role,
              phone: m.phone,
              profilePhoto: m.profilePhoto,
              allocatedStock: allocated,
              distributedStock: distributed,
              remainingStock: remaining
            };
          })
        );

        return {
          teamId: t._id,
          teamName: t.name,
          receivedFromCentral: teamReceived,
          issuedToMembers: teamIssued,
          remainingTeamStock,
          distributedByMembers: teamDistributed,
          remainingWithMembers: Math.max(0, teamIssued - teamDistributed),
          members: memberStats
        };
      })
    );

    return res.json({ success: true, data: breakdowns });
  } catch (err) {
    console.error('Team breakdown error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch team stock breakdown.' });
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
        { $match: { status: { $in: ['active', 'approved'] } } },
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

    // PRD Accounting Equation:
    // Total Accounted = Central Unallocated + Team Unallocated + Member Remaining + Member Distributed
    const accountedStock = unallocatedAtCentral + unallocatedAtTeams + remainingWithMembers + totalDistributed;
    const variance = campaignStock - accountedStock;

    // Team-level breakdown
    const teamBreakdowns = await Promise.all(
      teams.map(async (t) => {
        const [teamAllocAggResult, memberAllocs, teamDists] = await Promise.all([
          StockAllocation.aggregate([
            { $match: { teamId: t._id, memberId: null } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          StockAllocation.aggregate([
            { $match: { teamId: t._id, memberId: { $ne: null } } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          Distribution.aggregate([
            { $match: { teamId: t._id, status: { $in: ['active', 'approved'] } } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ])
        ]);

        const teamAllocQty = teamAllocAggResult[0] ? teamAllocAggResult[0].total : 0;
        const memberAllocQty = memberAllocs[0] ? memberAllocs[0].total : 0;
        const distQty = teamDists[0] ? teamDists[0].total : 0;
        const remainingInTeam = Math.max(0, teamAllocQty - memberAllocQty);
        const inMemberPossession = Math.max(0, memberAllocQty - distQty);

        return {
          teamId: t._id,
          teamName: t.name,
          allocatedToTeam: teamAllocQty,
          allocatedToMembers: memberAllocQty,
          unallocatedInTeam: remainingInTeam,
          distributed: distQty,
          remainingWithMembers: inMemberPossession,
          variance: teamAllocQty - (remainingInTeam + inMemberPossession + distQty)
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
