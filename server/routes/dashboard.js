import express from 'express';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Distribution from '../models/Distribution.js';
import Collection from '../models/Collection.js';
import MoneyTransfer from '../models/MoneyTransfer.js';
import StockAllocation from '../models/StockAllocation.js';
import CampaignConfig from '../models/CampaignConfig.js';
import Expense from '../models/Expense.js';
import Correction from '../models/Correction.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { isValidObjectId } from '../utils/validation.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/dashboard/admin - Super Admin & Usthad comprehensive view
router.get('/admin', requireRole('super_admin', 'usthad'), async (req, res) => {
  try {
    const [
      config,
      totalTeams,
      totalMembers,
      distAgg,
      colAgg,
      confirmedTransferAgg,
      pendingTransferAgg,
      expenseAgg,
      teamStockAgg,
      pendingTransfersCount,
      flaggedEntriesCount
    ] = await Promise.all([
      CampaignConfig.findOne().then((value) => value || {
        totalStock: 0,
        initialInvestment: 0,
        printingCost: 0,
        calendarPrice: 100
      }),
      Team.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: true, role: { $in: ['team_leader', 'team_member'] } }),
      Distribution.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, totalQty: { $sum: '$quantity' } } }
      ]),
      Collection.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, totalAmt: { $sum: '$amount' } } }
      ]),
      MoneyTransfer.aggregate([
        { $match: { status: 'confirmed' } },
        { $group: { _id: null, totalAmt: { $sum: '$amount' } } }
      ]),
      MoneyTransfer.aggregate([
        { $match: { status: { $in: ['pending', 'awaiting_confirmation'] } } },
        { $group: { _id: null, totalAmt: { $sum: '$amount' } } }
      ]),
      Expense.aggregate([
        { $group: { _id: '$category', totalAmt: { $sum: '$amount' } } }
      ]),
      StockAllocation.aggregate([
        { $match: { memberId: null } },
        { $group: { _id: null, totalAlloc: { $sum: '$quantity' } } }
      ]),
      MoneyTransfer.countDocuments({ status: { $in: ['pending', 'awaiting_confirmation'] } }),
      Correction.countDocuments({ status: 'pending' })
    ]);

    const totalDistributed = distAgg[0] ? distAgg[0].totalQty : 0;
    const totalCollected = colAgg[0] ? colAgg[0].totalAmt : 0;
    const confirmedTransfers = confirmedTransferAgg[0] ? confirmedTransferAgg[0].totalAmt : 0;
    const pendingTransfers = pendingTransferAgg[0] ? pendingTransferAgg[0].totalAmt : 0;
    const printingExpenses = expenseAgg.find((expense) => expense._id === 'printing');
    const otherExpenses = expenseAgg
      .filter((expense) => expense._id !== 'printing')
      .reduce((sum, expense) => sum + expense.totalAmt, 0);
    const totalPrintingCost = (config.printingCost || 0) + (printingExpenses ? printingExpenses.totalAmt : 0);
    const allocatedToTeams = teamStockAgg[0] ? teamStockAgg[0].totalAlloc : 0;

    const initialInvestment = config.initialInvestment || 0;
    const printingCost = config.printingCost || 0;
    const totalExpenses = initialInvestment + totalPrintingCost + otherExpenses;
    const netProfitOrLoss = totalCollected - totalExpenses;

    // Team rankings by distributed calendars
    const teams = await Team.find({ isActive: true }).select('name');
    const teamRankings = await Promise.all(
      teams.map(async (t) => {
        const [d, c] = await Promise.all([
          Distribution.aggregate([
            { $match: { teamId: t._id, status: 'active' } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          Collection.aggregate([
            { $match: { teamId: t._id, status: 'active' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ]);
        return {
          _id: t._id,
          name: t.name,
          distributed: d[0] ? d[0].total : 0,
          collected: c[0] ? c[0].total : 0
        };
      })
    );
    teamRankings.sort((a, b) => b.distributed - a.distributed);

    return res.json({
      success: true,
      data: {
        totalTeams,
        totalMembers,
        totalStock: config.totalStock,
        allocatedToTeams,
        remainingCampaignStock: Math.max(0, config.totalStock - allocatedToTeams),
        totalDistributed,
        totalCollected,
        confirmedTransfers,
        pendingTransfers,
        untransferredCollections: Math.max(0, totalCollected - confirmedTransfers - pendingTransfers),
        initialInvestment,
        printingCost: totalPrintingCost,
        otherExpenses,
        totalExpenses,
        netProfitOrLoss,
        pendingTransfersCount,
        flaggedEntriesCount,
        teamRankings: teamRankings.slice(0, 10)
      }
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate admin dashboard.' });
  }
});

// GET /api/dashboard/team/:teamId - Team Leader view
router.get('/team/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ success: false, error: 'Invalid team ID.' });
    }

    if (['team_leader', 'team_member'].includes(req.user.role)) {
      const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
      if (userTeamId !== teamId) {
        return res.status(403).json({ success: false, error: 'Access denied: You may only view your own team.' });
      }
    }

    const [
      team,
      teamStock,
      memberStockAgg,
      distAgg,
      colAgg,
      transferConfirmedAgg,
      transferPendingAgg,
      members,
      pendingCorrections
    ] = await Promise.all([
      Team.findById(teamId),
      StockAllocation.findOne({ teamId, memberId: null }),
      StockAllocation.aggregate([
        { $match: { teamId: new (await import('mongoose')).default.Types.ObjectId(teamId), memberId: { $ne: null } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Distribution.aggregate([
        { $match: { teamId: new (await import('mongoose')).default.Types.ObjectId(teamId), status: 'active' } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Collection.aggregate([
        { $match: { teamId: new (await import('mongoose')).default.Types.ObjectId(teamId), status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      MoneyTransfer.aggregate([
        { $match: { teamId: new (await import('mongoose')).default.Types.ObjectId(teamId), status: 'confirmed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      MoneyTransfer.aggregate([
        { $match: { teamId: new (await import('mongoose')).default.Types.ObjectId(teamId), status: { $in: ['pending', 'awaiting_confirmation'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      User.find({ teamId, isActive: true }).select('fullName role phone profilePhoto'),
      Correction.countDocuments({ status: 'pending' })
    ]);

    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const teamAllocated = teamStock ? teamStock.quantity : 0;
    const memberAllocated = memberStockAgg[0] ? memberStockAgg[0].total : 0;
    const totalDistributed = distAgg[0] ? distAgg[0].total : 0;
    const totalCollected = colAgg[0] ? colAgg[0].total : 0;
    const confirmedTransfers = transferConfirmedAgg[0] ? transferConfirmedAgg[0].total : 0;
    const pendingTransfers = transferPendingAgg[0] ? transferPendingAgg[0].total : 0;

    // Member progress breakdown
    const memberProgress = await Promise.all(
      members.map(async (m) => {
        const [d, c, a] = await Promise.all([
          Distribution.aggregate([
            { $match: { memberId: m._id, status: 'active' } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          Collection.aggregate([
            { $match: { memberId: m._id, status: 'active' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          StockAllocation.findOne({ teamId, memberId: m._id })
        ]);
        return {
          _id: m._id,
          fullName: m.fullName,
          role: m.role,
          phone: m.phone,
          profilePhoto: m.profilePhoto,
          allocated: a ? a.quantity : 0,
          distributed: d[0] ? d[0].total : 0,
          collected: c[0] ? c[0].total : 0
        };
      })
    );

    return res.json({
      success: true,
      data: {
        team: { _id: team._id, name: team.name },
        stockAllocatedToTeam: teamAllocated,
        stockAllocatedToMembers: memberAllocated,
        unallocatedTeamStock: Math.max(0, teamAllocated - memberAllocated),
        totalDistributed,
        totalCollected,
        confirmedTransfers,
        pendingTransfers,
        outstandingCollections: Math.max(0, totalCollected - confirmedTransfers - pendingTransfers),
        pendingCorrections,
        memberProgress
      }
    });
  } catch (err) {
    console.error('Team dashboard error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate team dashboard.' });
  }
});

// GET /api/dashboard/member/:memberId - Team Member personal view
router.get('/member/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    if (!isValidObjectId(memberId)) {
      return res.status(400).json({ success: false, error: 'Invalid member ID.' });
    }

    if (req.user.role === 'team_member' && req.user._id.toString() !== memberId) {
      return res.status(403).json({ success: false, error: 'Access denied: You may only view your own statistics.' });
    }

    const member = await User.findById(memberId).populate('teamId', 'name');
    if (!member) {
      return res.status(404).json({ success: false, error: 'Member not found.' });
    }

    const teamId = member.teamId ? (member.teamId._id || member.teamId) : null;

    const [stockAlloc, distAgg, colAgg, transferConfirmedAgg, transferPendingAgg, recentDist, recentCol, recentTransfers] = await Promise.all([
      teamId ? StockAllocation.findOne({ teamId, memberId }) : null,
      Distribution.aggregate([
        { $match: { memberId: member._id, status: 'active' } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Collection.aggregate([
        { $match: { memberId: member._id, status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      MoneyTransfer.aggregate([
        { $match: { fromUserId: member._id, status: 'confirmed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      MoneyTransfer.aggregate([
        { $match: { fromUserId: member._id, status: { $in: ['pending', 'awaiting_confirmation'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Distribution.find({ memberId: member._id }).populate('areaId', 'name').sort({ date: -1 }).limit(5),
      Collection.find({ memberId: member._id }).populate('areaId', 'name').sort({ date: -1 }).limit(5),
      MoneyTransfer.find({ fromUserId: member._id }).sort({ transferDate: -1 }).limit(5)
    ]);

    const allocatedStock = stockAlloc ? stockAlloc.quantity : 0;
    const distributedStock = distAgg[0] ? distAgg[0].total : 0;
    const collectedAmount = colAgg[0] ? colAgg[0].total : 0;
    const confirmedTransfers = transferConfirmedAgg[0] ? transferConfirmedAgg[0].total : 0;
    const pendingTransfers = transferPendingAgg[0] ? transferPendingAgg[0].total : 0;

    return res.json({
      success: true,
      data: {
        member: {
          _id: member._id,
          fullName: member.fullName,
          role: member.role,
          phone: member.phone,
          team: member.teamId ? member.teamId.name : 'Unassigned',
          profilePhoto: member.profilePhoto
        },
        allocatedStock,
        distributedStock,
        remainingStock: Math.max(0, allocatedStock - distributedStock),
        collectedAmount,
        confirmedTransfers,
        pendingTransfers,
        untransferredAmount: Math.max(0, collectedAmount - confirmedTransfers - pendingTransfers),
        recentDistributions: recentDist,
        recentCollections: recentCol,
        recentTransfers
      }
    });
  } catch (err) {
    console.error('Member dashboard error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate member dashboard.' });
  }
});

// GET /api/dashboard/rankings - Overall rankings
router.get('/rankings', requireRole('super_admin', 'usthad'), async (req, res) => {
  try {
    const [teamRankings, memberRankings] = await Promise.all([
      Distribution.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$teamId', totalDistributed: { $sum: '$quantity' } } },
        { $lookup: { from: 'teams', localField: '_id', foreignField: '_id', as: 'team' } },
        { $unwind: '$team' },
        { $project: { _id: 1, name: '$team.name', totalDistributed: 1 } },
        { $sort: { totalDistributed: -1 } }
      ]),
      Distribution.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$memberId', totalDistributed: { $sum: '$quantity' } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $lookup: { from: 'teams', localField: 'user.teamId', foreignField: '_id', as: 'team' } },
        { $unwind: { path: '$team', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, fullName: '$user.fullName', teamName: '$team.name', totalDistributed: 1 } },
        { $sort: { totalDistributed: -1 } },
        { $limit: 15 }
      ])
    ]);

    return res.json({
      success: true,
      data: {
        teamRankings,
        memberRankings
      }
    });
  } catch (err) {
    console.error('Rankings error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch rankings.' });
  }
});

export default router;
