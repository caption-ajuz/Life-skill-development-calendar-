import express from 'express';
import mongoose from 'mongoose';
import Distribution from '../models/Distribution.js';
import Collection from '../models/Collection.js';
import MoneyTransfer from '../models/MoneyTransfer.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Area from '../models/Area.js';
import CampaignConfig from '../models/CampaignConfig.js';
import { authMiddleware } from '../middleware/auth.js';
import { isValidObjectId } from '../utils/validation.js';
import { buildDailyReport, buildOverallReport, buildCustomWhatsAppReport } from '../utils/whatsappReports.js';

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
      reportType,
      reportFormat = 'daily',
      date,
      dateFrom,
      dateTo,
      breakdown = 'team',
      teamId,
      memberId,
      areaId,
      offlineCount = 0,
      sections: rawSections,
      customFooterNote
    } = req.query;

    const activeReportType = reportType || reportFormat || 'daily';

    // Parse section checkboxes with smart defaults
    let parsedSections = {
      includeHeader: true,
      includeSummary: true,
      includeLeaderboard: true,
      includeBreakdown: true,
      includeTopPerformers: true,
      includeHandoverStatus: true,
      includeProgressBar: true,
      includeTargetProgress: false,
      includeCollectionRanking: true,
      includeTeamSubmissionStatus: true,
      includeZeroActivity: false,
      includeOfflineNotice: true,
      includeFooter: true
    };

    if (typeof rawSections === 'string') {
      try {
        parsedSections = { ...parsedSections, ...JSON.parse(rawSections) };
      } catch {}
    } else if (rawSections && typeof rawSections === 'object') {
      parsedSections = { ...parsedSections, ...rawSections };
    }

    [
      'includeHeader',
      'includeSummary',
      'includeLeaderboard',
      'includeBreakdown',
      'includeTopPerformers',
      'includeHandoverStatus',
      'includeProgressBar',
      'includeTargetProgress',
      'includeCollectionRanking',
      'includeTeamSubmissionStatus',
      'includeZeroActivity',
      'includeOfflineNotice',
      'includeFooter'
    ].forEach((k) => {
      if (req.query[k] !== undefined) {
        parsedSections[k] = req.query[k] === 'true' || req.query[k] === true;
      }
    });

    const user = req.user;
    const isSuperOrUsthad = ['super_admin', 'usthad'].includes(user.role);
    const isTeamLeader = user.role === 'team_leader';
    const isTeamMember = user.role === 'team_member';

    // Parse date filters
    let targetDateStart = null;
    let targetDateEnd = null;
    let displayDateStr = '';

    if (activeReportType === 'daily') {
      const d = date ? new Date(date) : new Date();
      targetDateStart = new Date(d);
      targetDateStart.setHours(0, 0, 0, 0);
      targetDateEnd = new Date(d);
      targetDateEnd.setHours(23, 59, 59, 999);
      displayDateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } else {
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

    // Build Match Queries — Exclude unapproved (pending, rejected) entries from official totals & rankings
    const distMatch = {
      $and: [
        { status: { $in: ['approved', 'active'] } },
        { approvalStatus: { $nin: ['pending', 'rejected'] } }
      ]
    };
    const colMatch = {
      $and: [
        { status: { $in: ['approved', 'active'] } },
        { approvalStatus: { $nin: ['pending', 'rejected'] } }
      ]
    };
    const transMatch = { status: 'confirmed' };

    if (scopedTeamId) {
      const teamObjId = new mongoose.Types.ObjectId(scopedTeamId);
      distMatch.$and.push({ teamId: teamObjId });
      colMatch.$and.push({ teamId: teamObjId });
      transMatch.teamId = teamObjId;
    }
    if (scopedMemberId) {
      const memberObjId = new mongoose.Types.ObjectId(scopedMemberId);
      distMatch.$and.push({ memberId: memberObjId });
      colMatch.$and.push({ memberId: memberObjId });
      transMatch.fromUserId = memberObjId;
    }
    if (areaId && isValidObjectId(areaId)) {
      const areaObjId = new mongoose.Types.ObjectId(areaId);
      distMatch.$and.push({ areaId: areaObjId });
      colMatch.$and.push({ areaId: areaObjId });
    }

    // Date filters
    if (targetDateStart || targetDateEnd) {
      const dateFilter = {};
      if (targetDateStart) dateFilter.$gte = targetDateStart;
      if (targetDateEnd) dateFilter.$lte = targetDateEnd;
      distMatch.$and.push({ date: dateFilter });
      colMatch.$and.push({ date: dateFilter });
      transMatch.transferDate = dateFilter;
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

    // Build structured teamsData for team-wise performance and rankings
    const relevantTeams = scopedTeamId
      ? allTeams.filter(t => t._id.toString() === scopedTeamId.toString())
      : allTeams;

    const teamIds = relevantTeams.map(t => t._id);
    const usersInTeams = await User.find({ teamId: { $in: teamIds } }).select('fullName phone teamId role collectionTarget');

    const [memberDistAgg, memberColAgg] = await Promise.all([
      Distribution.aggregate([
        { $match: distMatch },
        { $group: { _id: '$memberId', distributed: { $sum: '$quantity' } } }
      ]),
      Collection.aggregate([
        { $match: colMatch },
        { $group: { _id: '$memberId', collected: { $sum: '$amount' } } }
      ])
    ]);

    const memberDistMap = new Map(memberDistAgg.map(x => [x._id ? x._id.toString() : '', x.distributed]));
    const memberColMap = new Map(memberColAgg.map(x => [x._id ? x._id.toString() : '', x.collected]));

    const teamsData = relevantTeams.map(t => {
      const tIdStr = t._id.toString();
      const membersForTeam = usersInTeams.filter(u => u.teamId && u.teamId.toString() === tIdStr);

      const members = membersForTeam.map(u => {
        const uIdStr = u._id.toString();
        return {
          id: u._id,
          name: u.fullName,
          role: u.role,
          target: u.collectionTarget !== undefined && u.collectionTarget !== null ? u.collectionTarget : 25000,
          distributed: memberDistMap.get(uIdStr) || 0,
          collected: memberColMap.get(uIdStr) || 0
        };
      });

      const teamDist = members.reduce((sum, m) => sum + m.distributed, 0);
      const teamCol = members.reduce((sum, m) => sum + m.collected, 0);

      return {
        id: t._id,
        name: t.name,
        distributed: teamDist,
        collected: teamCol,
        members
      };
    });

        // Calculate Daily Team Submission Status (ഇന്നത്തെ കണക്ക് ലഭിച്ചത്)
    const teamSubmissions = await Promise.all(
      allTeams.map(async (t) => {
        const teamFilter = { teamId: t._id, status: { $in: ['active', 'approved'] } };
        if (targetDateStart && targetDateEnd) {
          teamFilter.date = { $gte: targetDateStart, $lte: targetDateEnd };
        }
        const [cCount, dCount] = await Promise.all([
          Collection.countDocuments(teamFilter),
          Distribution.countDocuments(teamFilter)
        ]);
        const hasSubmitted = (cCount > 0 || dCount > 0 || (t.leaderEntersOverallCollection && (t.overallCollectedAmount || 0) > 0));
        return {
          _id: t._id,
          name: t.name,
          hasSubmitted
        };
      })
    );

    const rankingPeriodTitle = req.query.periodTitle || (
      req.query.dateScope === '3_days' ? '3 Days Collections' :
      req.query.dateScope === '1_day' || req.query.dateScope === 'today' ? '1 Day Collections' :
      req.query.dateScope === 'cumulative' ? 'Total Collections Ranking' :
      'Collections Ranking'
    );

    const generatedText = buildCustomWhatsAppReport({
      teamSubmissions,
      rankingPeriodTitle,
      reportType: activeReportType,
      dateStr: displayDateStr,
      scopeTitle,
      role: user.role,
      campaignConfig: { totalStock: config.totalStock, calendarPrice: config.calendarPrice },
      teamsData,
      totals: {
        distributed: totalDistributed,
        collected: totalCollected,
        transferred: totalTransferred,
        teamsCount: allTeams.length,
        membersCount: membersCount || usersInTeams.length,
        areasCount
      },
      offlinePendingCount: parseInt(offlineCount, 10) || 0,
      sections: parsedSections,
      customFooterNote: customFooterNote || ''
    });

    return res.json({
      success: true,
      text: generatedText,
      metadata: {
        reportType: activeReportType,
        displayDate: displayDateStr,
        scopeTitle,
        totals: {
          distributed: totalDistributed,
          collected: totalCollected,
          transferred: totalTransferred,
          areasCount,
          membersCount
        },
        sections: parsedSections,
        itemCount: teamsData.reduce((sum, t) => sum + (t.members ? t.members.length : 0), 0)
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
