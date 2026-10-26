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
        { $match: { $or: [{ status: 'active' }, { status: 'approved' }, { approvalStatus: 'approved' }] } },
        { $group: { _id: null, totalQty: { $sum: '$quantity' } } }
      ]),
      Collection.aggregate([
        { $match: { $or: [{ status: 'active' }, { status: 'approved' }, { approvalStatus: 'approved' }] } },
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
    const teams = await Team.find({ isActive: true }).select('name leaderEntersOverallCollection overallCollectedAmount');
    const teamRankings = await Promise.all(
      teams.map(async (t) => {
        const [d, c] = await Promise.all([
          Distribution.aggregate([
            { $match: { teamId: t._id, $or: [{ status: 'active' }, { status: 'approved' }, { approvalStatus: 'approved' }] } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          Collection.aggregate([
            { $match: { teamId: t._id, $or: [{ status: 'active' }, { status: 'approved' }, { approvalStatus: 'approved' }] } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ]);
        const collected = t.leaderEntersOverallCollection
          ? (t.overallCollectedAmount || 0)
          : (c[0] ? c[0].total : 0);
        return {
          _id: t._id,
          name: t.name,
          leaderEntersOverallCollection: Boolean(t.leaderEntersOverallCollection),
          overallCollectedAmount: t.overallCollectedAmount || 0,
          distributed: d[0] ? d[0].total : 0,
          collected
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

// GET /api/dashboard/team/:teamId - Team Leader view with team progress, personal progress, and pending approvals
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

    const mongooseModule = (await import('mongoose')).default;
    const teamObjId = new mongooseModule.Types.ObjectId(teamId);

    const [
      team,
      teamStockAgg,
      memberStockAgg,
      distAgg,
      colAgg,
      transferConfirmedAgg,
      transferPendingAgg,
      members,
      pendingCollections,
      pendingDistributions,
      pendingCorrections
    ] = await Promise.all([
      Team.findById(teamId),
      StockAllocation.aggregate([
        { $match: { teamId: teamObjId, memberId: null } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      StockAllocation.aggregate([
        { $match: { teamId: teamObjId, memberId: { $ne: null } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Distribution.aggregate([
        { $match: { teamId: teamObjId, status: { $in: ['active', 'approved'] }, approvalStatus: { $ne: 'rejected' } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Collection.aggregate([
        { $match: { teamId: teamObjId, status: { $in: ['active', 'approved'] }, approvalStatus: { $ne: 'rejected' } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      MoneyTransfer.aggregate([
        { $match: { teamId: teamObjId, status: 'confirmed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      MoneyTransfer.aggregate([
        { $match: { teamId: teamObjId, status: { $in: ['pending', 'awaiting_confirmation'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      User.find({ teamId: teamObjId, isActive: true }).select('fullName username role phone profilePhoto collectionTarget'),
      Collection.find({ teamId: teamObjId, approvalStatus: 'pending' })
        .populate('memberId', 'fullName username phone profilePhoto')
        .populate('areaId', 'name district')
        .sort({ date: -1, createdAt: -1 })
        .limit(50),
      Distribution.find({ teamId: teamObjId, approvalStatus: 'pending' })
        .populate('memberId', 'fullName username phone profilePhoto')
        .populate('areaId', 'name district')
        .sort({ date: -1, createdAt: -1 })
        .limit(50),
      Correction.countDocuments({ status: 'pending' })
    ]);

    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const teamAllocated = teamStockAgg[0] ? teamStockAgg[0].total : 0;
    const memberAllocated = memberStockAgg[0] ? memberStockAgg[0].total : 0;
    const totalDistributed = distAgg[0] ? distAgg[0].total : 0;
    const totalCollected = team.leaderEntersOverallCollection
      ? (team.overallCollectedAmount || 0)
      : (colAgg[0] ? colAgg[0].total : 0);
    const confirmedTransfers = transferConfirmedAgg[0] ? transferConfirmedAgg[0].total : 0;
    const pendingTransfers = transferPendingAgg[0] ? transferPendingAgg[0].total : 0;

    // Leader's personal progress calculation
    const leaderUser = members.find((m) => m.role === 'team_leader') || req.user;
    let leaderPersonalProgress = null;
    if (leaderUser) {
      const leaderColAgg = await Collection.aggregate([
        {
          $match: {
            memberId: leaderUser._id,
            status: { $in: ['active', 'approved'] },
            approvalStatus: { $ne: 'rejected' }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const leaderCollected = leaderColAgg[0] ? leaderColAgg[0].total : 0;
      const leaderTarget = leaderUser.collectionTarget || 25000;
      const leaderRemaining = Math.max(0, leaderTarget - leaderCollected);
      const leaderPercentage = leaderTarget > 0 ? Math.min(100, Math.round((leaderCollected / leaderTarget) * 100)) : 0;

      leaderPersonalProgress = {
        userId: leaderUser._id,
        fullName: leaderUser.fullName,
        target: leaderTarget,
        approvedCollected: leaderCollected,
        remaining: leaderRemaining,
        progressPercent: leaderPercentage
      };
    }

    // Individual Member Progress breakdown
    const memberProgress = await Promise.all(
      members.map(async (m) => {
        const [d, c, a] = await Promise.all([
          Distribution.aggregate([
            { $match: { memberId: m._id, status: { $in: ['active', 'approved'] }, approvalStatus: { $ne: 'rejected' } } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          Collection.aggregate([
            { $match: { memberId: m._id, status: { $in: ['active', 'approved'] }, approvalStatus: { $ne: 'rejected' } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          StockAllocation.aggregate([
            { $match: { memberId: m._id } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ])
        ]);

        const allocated = a[0] ? a[0].total : 0;
        const distributed = d[0] ? d[0].total : 0;
        const collected = c[0] ? c[0].total : 0;
        const target = m.collectionTarget !== undefined && m.collectionTarget !== null ? m.collectionTarget : 25000;
        const remainingToTarget = Math.max(0, target - collected);
        const targetPercentage = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;

        return {
          _id: m._id,
          fullName: m.fullName,
          username: m.username,
          role: m.role,
          phone: m.phone,
          profilePhoto: m.profilePhoto,
          allocated,
          distributed,
          remainingStock: Math.max(0, allocated - distributed),
          collected,
          target,
          remainingToTarget,
          targetPercentage
        };
      })
    );

    // Team collection target summary
    const regularMembers = memberProgress.filter((m) => m.role === 'team_member');
    const totalTeamTarget = memberProgress.reduce((sum, m) => sum + (m.target || 25000), 0);
    const remainingTeamTarget = Math.max(0, totalTeamTarget - totalCollected);
    const teamTargetPercentage = totalTeamTarget > 0 ? Math.min(100, Math.round((totalCollected / totalTeamTarget) * 100)) : 0;

    const teamTargetSummary = {
      totalTarget: totalTeamTarget,
      totalCollected,
      remaining: remainingTeamTarget,
      progressPercent: teamTargetPercentage
    };

    return res.json({
      success: true,
      data: {
        team: {
          _id: team._id,
          name: team.name,
          leaderEntersOverallCollection: Boolean(team.leaderEntersOverallCollection),
          overallCollectedAmount: team.overallCollectedAmount || 0,
          overallCollectionNotes: team.overallCollectionNotes || '',
          overallCollectionUpdatedAt: team.overallCollectionUpdatedAt || null
        },
        stockAllocatedToTeam: teamAllocated,
        stockAllocatedToMembers: memberAllocated,
        unallocatedTeamStock: Math.max(0, teamAllocated - memberAllocated),
        totalDistributed,
        totalCollected,
        confirmedTransfers,
        pendingTransfers,
        outstandingCollections: Math.max(0, totalCollected - confirmedTransfers - pendingTransfers),
        pendingCorrections,
        pendingApprovals: {
          collections: pendingCollections,
          distributions: pendingDistributions,
          total: pendingCollections.length + pendingDistributions.length
        },
        leaderPersonalProgress,
        teamTargetSummary,
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

    const [stockAllocAgg, distAgg, colAgg, transferConfirmedAgg, transferPendingAgg, recentDist, recentCol, recentTransfers] = await Promise.all([
      StockAllocation.aggregate([
        { $match: { memberId: member._id } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Distribution.aggregate([
        { $match: { memberId: member._id, status: { $in: ['active', 'approved'] }, approvalStatus: { $ne: 'rejected' } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Collection.aggregate([
        { $match: { memberId: member._id, status: { $in: ['active', 'approved'] }, approvalStatus: { $ne: 'rejected' } } },
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

    const allocatedStock = stockAllocAgg[0] ? stockAllocAgg[0].total : 0;
    const distributedStock = distAgg[0] ? distAgg[0].total : 0;
    const collectedAmount = colAgg[0] ? colAgg[0].total : 0;
    const confirmedTransfers = transferConfirmedAgg[0] ? transferConfirmedAgg[0].total : 0;
    const pendingTransfers = transferPendingAgg[0] ? transferPendingAgg[0].total : 0;

    const collectionTarget = member.collectionTarget !== undefined && member.collectionTarget !== null ? member.collectionTarget : 25000;
    const remainingToTarget = Math.max(0, collectionTarget - collectedAmount);
    const targetPercentage = collectionTarget > 0 ? Math.min(100, Math.round((collectedAmount / collectionTarget) * 100)) : 0;

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
        collectionTarget,
        remainingToTarget,
        targetPercentage,
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
