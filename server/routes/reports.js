import express from 'express';
import Distribution from '../models/Distribution.js';
import Collection from '../models/Collection.js';
import MoneyTransfer from '../models/MoneyTransfer.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Area from '../models/Area.js';
import CampaignConfig from '../models/CampaignConfig.js';
import { authMiddleware } from '../middleware/auth.js';
import { isValidObjectId } from '../utils/validation.js';
import { buildDailyReport, buildOverallReport } from '../utils/whatsappReports.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/reports/data - Filtered reports data for export & table view
router.get('/data', async (req, res) => {
  try {
    const { type = 'distribution', teamId, memberId, areaId, status, dateFrom, dateTo } = req.query;

    const query = {};

    // Role-based permission enforcement
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
      const dateField = type === 'transfer' ? 'transferDate' : 'date';
      query[dateField] = {};
      if (dateFrom) query[dateField].$gte = new Date(dateFrom);
      if (dateTo) query[dateField].$lte = new Date(dateTo);
    }

    let records = [];

    if (type === 'distribution') {
      records = await Distribution.find(query)
        .populate('memberId', 'fullName phone')
        .populate('teamId', 'name')
        .populate('areaId', 'name district')
        .sort({ date: -1 })
        .limit(1000);
    } else if (type === 'collection') {
      records = await Collection.find(query)
        .populate('memberId', 'fullName phone')
        .populate('teamId', 'name')
        .populate('areaId', 'name district')
        .sort({ date: -1 })
        .limit(1000);
    } else if (type === 'transfer') {
      if (req.user.role === 'team_member') {
        query.fromUserId = req.user._id;
        delete query.memberId;
      }
      records = await MoneyTransfer.find(query)
        .populate('fromUserId', 'fullName phone role')
        .populate('teamId', 'name')
        .populate('confirmedBy', 'fullName')
        .sort({ transferDate: -1 })
        .limit(1000);
    }

    return res.json({ success: true, data: records, type });
  } catch (err) {
    console.error('Report data error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate report data.' });
  }
});

// GET /api/reports/whatsapp-summary - Readable WhatsApp-ready text summary (Daily & Overall formats)
router.get('/whatsapp-summary', async (req, res) => {
  try {
    const {
      reportFormat = 'daily', // 'daily' | 'overall'
      date,                   // YYYY-MM-DD
      dateFrom,
      dateTo,
      breakdown = 'team',     // 'team' | 'area' | 'member'
      teamId,
      areaId,
      offlineCount = 0
    } = req.query;

    const user = req.user;
    const isSuperOrUsthad = ['super_admin', 'usthad'].includes(user.role);
    const isTeamLeader = user.role === 'team_leader';
    const isTeamMember = user.role === 'team_member';

    // Parse date filters
    let targetDateStart = null;
    let targetDateEnd = null;
    let displayDateStr = '';

    if (reportFormat === 'daily') {
      const d = date ? new Date(date) : new Date();
      targetDateStart = new Date(d);
      targetDateStart.setHours(0, 0, 0, 0);
      targetDateEnd = new Date(d);
      targetDateEnd.setHours(23, 59, 59, 999);
      displayDateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } else {
      // Overall progress report
      if (dateFrom) {
        targetDateStart = new Date(dateFrom);
        targetDateStart.setHours(0, 0, 0, 0);
      }
      if (dateTo) {
        targetDateEnd = new Date(dateTo);
        targetDateEnd.setHours(23, 59, 59, 999);
      }
      displayDateStr = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    // Role-based scope
    let scopedTeamId = null;
    let scopedMemberId = null;

    if (isTeamMember) {
      scopedMemberId = user._id;
      scopedTeamId = user.teamId ? (user.teamId._id || user.teamId) : null;
    } else if (isTeamLeader) {
      scopedTeamId = user.teamId ? (user.teamId._id || user.teamId) : null;
      if (req.query.memberId && isValidObjectId(req.query.memberId)) {
        scopedMemberId = req.query.memberId;
      }
    } else {
      if (teamId && isValidObjectId(teamId)) scopedTeamId = teamId;
      if (req.query.memberId && isValidObjectId(req.query.memberId)) scopedMemberId = req.query.memberId;
    }

    // Build Match Queries
    const distMatch = { status: 'active' };
    const colMatch = { status: 'active' };
    const transMatch = { status: 'confirmed' };

    if (scopedTeamId) {
      distMatch.teamId = new (await import('mongoose')).default.Types.ObjectId(scopedTeamId);
      colMatch.teamId = distMatch.teamId;
      transMatch.teamId = distMatch.teamId;
    }
    if (scopedMemberId) {
      distMatch.memberId = new (await import('mongoose')).default.Types.ObjectId(scopedMemberId);
      colMatch.memberId = distMatch.memberId;
      transMatch.fromUserId = distMatch.memberId;
    }
    if (areaId && isValidObjectId(areaId)) {
      distMatch.areaId = new (await import('mongoose')).default.Types.ObjectId(areaId);
      colMatch.areaId = distMatch.areaId;
    }

    // Date filters
    if (targetDateStart || targetDateEnd) {
      distMatch.date = {};
      colMatch.date = {};
      transMatch.transferDate = {};
      if (targetDateStart) {
        distMatch.date.$gte = targetDateStart;
        colMatch.date.$gte = targetDateStart;
        transMatch.transferDate.$gte = targetDateStart;
      }
      if (targetDateEnd) {
        distMatch.date.$lte = targetDateEnd;
        colMatch.date.$lte = targetDateEnd;
        transMatch.transferDate.$lte = targetDateEnd;
      }
    }

    // Fetch config, teams, areas, and users for reference
    const [config, allTeams, allAreas] = await Promise.all([
      CampaignConfig.findOne().then(c => c || { totalStock: 5000, calendarPrice: 100 }),
      Team.find({ isActive: true }).select('name'),
      Area.find({ mergedIntoId: null }).select('name district')
    ]);

    // Aggregate totals
    const [distTotAgg, colTotAgg, transTotAgg, uniqueAreasAgg, uniqueMembersAgg] = await Promise.all([
      Distribution.aggregate([{ $match: distMatch }, { $group: { _id: null, total: { $sum: '$quantity' } } }]),
      Collection.aggregate([{ $match: colMatch }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      MoneyTransfer.aggregate([{ $match: transMatch }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Distribution.aggregate([{ $match: distMatch }, { $group: { _id: '$areaId' } }]),
      Distribution.aggregate([{ $match: distMatch }, { $group: { _id: '$memberId' } }])
    ]);

    const totalDistributed = distTotAgg[0] ? distTotAgg[0].total : 0;
    const totalCollected = colTotAgg[0] ? colTotAgg[0].total : 0;
    const totalTransferred = transTotAgg[0] ? transTotAgg[0].total : 0;
    const areasCount = uniqueAreasAgg.length;
    const membersCount = uniqueMembersAgg.length;

    // Determine Scope Title
    let scopeTitle = 'Campaign-Wide (All Teams)';
    if (scopedMemberId && isTeamMember) {
      scopeTitle = `Member: ${user.fullName}`;
    } else if (scopedTeamId) {
      const t = allTeams.find(x => x._id.toString() === scopedTeamId.toString());
      scopeTitle = `Team: ${t ? t.name : 'Selected Team'}`;
    } else if (areaId) {
      const a = allAreas.find(x => x._id.toString() === areaId.toString());
      scopeTitle = `Area: ${a ? a.name : 'Selected Area'}`;
    }

    // Build Breakdown Items (by team, area, or member)
    let items = [];

    if (breakdown === 'area') {
      const [distAreaAgg, colAreaAgg] = await Promise.all([
        Distribution.aggregate([
          { $match: distMatch },
          { $group: { _id: '$areaId', distributed: { $sum: '$quantity' } } }
        ]),
        Collection.aggregate([
          { $match: colMatch },
          { $group: { _id: '$areaId', collected: { $sum: '$amount' } } }
        ])
      ]);

      const colMap = new Map(colAreaAgg.map(x => [x._id ? x._id.toString() : '', x.collected]));
      items = distAreaAgg.map(item => {
        const areaObj = allAreas.find(a => a._id.toString() === (item._id ? item._id.toString() : ''));
        return {
          id: item._id,
          name: areaObj ? `${areaObj.name} (${areaObj.district})` : 'Unassigned Area',
          distributed: item.distributed,
          collected: colMap.get(item._id ? item._id.toString() : '') || 0,
          transferred: 0
        };
      });
    } else if (breakdown === 'member' || isTeamLeader || isTeamMember) {
      // Member breakdown
      const memberQuery = {};
      if (scopedTeamId) memberQuery.teamId = scopedTeamId;
      if (scopedMemberId) memberQuery._id = scopedMemberId;

      const teamMembers = await User.find(memberQuery).select('fullName phone');

      const [distMemberAgg, colMemberAgg, transMemberAgg] = await Promise.all([
        Distribution.aggregate([
          { $match: distMatch },
          { $group: { _id: '$memberId', distributed: { $sum: '$quantity' } } }
        ]),
        Collection.aggregate([
          { $match: colMatch },
          { $group: { _id: '$memberId', collected: { $sum: '$amount' } } }
        ]),
        MoneyTransfer.aggregate([
          { $match: transMatch },
          { $group: { _id: '$fromUserId', transferred: { $sum: '$amount' } } }
        ])
      ]);

      const colMap = new Map(colMemberAgg.map(x => [x._id ? x._id.toString() : '', x.collected]));
      const transMap = new Map(transMemberAgg.map(x => [x._id ? x._id.toString() : '', x.transferred]));

      items = distMemberAgg.map(item => {
        const m = teamMembers.find(u => u._id.toString() === (item._id ? item._id.toString() : ''));
        return {
          id: item._id,
          name: m ? m.fullName : 'Team Member',
          distributed: item.distributed,
          collected: colMap.get(item._id ? item._id.toString() : '') || 0,
          transferred: transMap.get(item._id ? item._id.toString() : '') || 0
        };
      });
    } else {
      // Team breakdown (default)
      const [distTeamAgg, colTeamAgg, transTeamAgg] = await Promise.all([
        Distribution.aggregate([
          { $match: distMatch },
          { $group: { _id: '$teamId', distributed: { $sum: '$quantity' } } }
        ]),
        Collection.aggregate([
          { $match: colMatch },
          { $group: { _id: '$teamId', collected: { $sum: '$amount' } } }
        ]),
        MoneyTransfer.aggregate([
          { $match: transMatch },
          { $group: { _id: '$teamId', transferred: { $sum: '$amount' } } }
        ])
      ]);

      const colMap = new Map(colTeamAgg.map(x => [x._id ? x._id.toString() : '', x.collected]));
      const transMap = new Map(transTeamAgg.map(x => [x._id ? x._id.toString() : '', x.transferred]));

      items = distTeamAgg.map(item => {
        const t = allTeams.find(x => x._id.toString() === (item._id ? item._id.toString() : ''));
        return {
          id: item._id,
          name: t ? t.name : 'Independent Group',
          distributed: item.distributed,
          collected: colMap.get(item._id ? item._id.toString() : '') || 0,
          transferred: transMap.get(item._id ? item._id.toString() : '') || 0
        };
      });
    }

    // Sort items by distributed descending
    items.sort((a, b) => b.distributed - a.distributed);

    // Compute accurate ranks handling ties
    let currentRank = 1;
    const rankedItems = items.map((item, idx, arr) => {
      if (idx > 0 && item.distributed < arr[idx - 1].distributed) {
        currentRank = idx + 1;
      }
      return { ...item, rank: currentRank };
    });

    let generatedText = '';

    if (reportFormat === 'overall') {
      generatedText = buildOverallReport({
        timestampStr: displayDateStr,
        scopeTitle,
        role: user.role,
        campaignConfig: { totalStock: config.totalStock, calendarPrice: config.calendarPrice },
        rankedItems,
        totals: {
          distributed: totalDistributed,
          collected: totalCollected,
          transferred: totalTransferred,
          teamsCount: allTeams.length,
          membersCount: membersCount || items.length,
          areasCount
        },
        offlinePendingCount: parseInt(offlineCount, 10) || 0
      });
    } else {
      // Daily Report
      generatedText = buildDailyReport({
        dateStr: displayDateStr,
        scopeTitle,
        role: user.role,
        items: rankedItems,
        totals: {
          distributed: totalDistributed,
          collected: totalCollected,
          transferred: totalTransferred,
          areasCount,
          membersCount: membersCount || items.length
        },
        offlinePendingCount: parseInt(offlineCount, 10) || 0
      });
    }

    return res.json({
      success: true,
      text: generatedText,
      metadata: {
        format: reportFormat,
        displayDate: displayDateStr,
        scopeTitle,
        totals: {
          distributed: totalDistributed,
          collected: totalCollected,
          transferred: totalTransferred,
          areasCount,
          membersCount
        },
        itemCount: items.length
      }
    });
  } catch (err) {
    console.error('WhatsApp summary generation error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate WhatsApp report.' });
  }
});

// GET /api/reports/thank-you - Prepare donor thank-you message
router.get('/thank-you', (req, res) => {
  const { donorName, amount, phone } = req.query;
  const amt = amount ? `₹${parseFloat(amount).toLocaleString('en-IN')}` : '';
  const name = donorName ? ` ${donorName.trim()}` : '';

  const message = `Assalamu Alaikum${name},\n\n` +
    `Thank you very much for contributing ${amt} towards the Markazul Hidayathil Islamiyya Calendar Campaign.\n\n` +
    `May Allah accept your noble contribution and reward you with abundance.\n\n` +
    `_Markazul Hidayathil Islamiyya, Kombam_`;

  return res.json({
    success: true,
    phone: phone || '',
    message,
    whatsappUrl: `https://api.whatsapp.com/send?${phone ? `phone=${encodeURIComponent(phone)}&` : ''}text=${encodeURIComponent(message)}`
  });
});

export default router;
