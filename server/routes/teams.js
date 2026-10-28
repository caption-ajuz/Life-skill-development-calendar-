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
import { getActiveCampaign } from '../utils/campaignHelper.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/teams - All users can list teams (basic metadata)
router.get('/', async (req, res) => {
  try {
    const filter = req.query.includeArchived === 'true'
      ? {}
      : { isActive: true, isArchived: { $ne: true } };

    if (req.query.campaignId && isValidObjectId(req.query.campaignId)) {
      filter.campaignId = req.query.campaignId;
    }

    const teams = await Team.find(filter).populate('leaderId', 'fullName phone profilePhoto username role').sort({ name: 1 });

    // Aggregate statistics per team
    const teamStats = await Promise.all(
      teams.map(async (t) => {
        const teamId = t._id;

        const [memberCount, leaderUser, distAgg, colAgg, teamAllocAgg, memberAllocAgg] = await Promise.all([
          User.countDocuments({ teamId, isActive: true }),
          User.findOne({ teamId, role: 'team_leader', isActive: true }).select('_id fullName phone profilePhoto'),
          Distribution.aggregate([
            { $match: { teamId, status: { $in: ['active', 'approved'] } } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          Collection.aggregate([
            { $match: { teamId, status: { $in: ['active', 'approved'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          StockAllocation.aggregate([
            { $match: { teamId, memberId: null } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          StockAllocation.aggregate([
            { $match: { teamId, memberId: { $ne: null } } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ])
        ]);

        const totalCollected = t.leaderEntersOverallCollection
          ? (t.overallCollectedAmount || 0)
          : (colAgg[0] ? colAgg[0].total : 0);

        const allocatedStock = teamAllocAgg[0] ? teamAllocAgg[0].total : 0;
        const issuedToMembers = memberAllocAgg[0] ? memberAllocAgg[0].total : 0;
        const remainingTeamStock = Math.max(0, allocatedStock - issuedToMembers);
        const totalDistributed = distAgg[0] ? distAgg[0].total : 0;

        return {
          _id: t._id,
          name: t.name,
          description: t.description,
          isActive: t.isActive,
          isArchived: Boolean(t.isArchived),
          archivedAt: t.archivedAt || null,
          campaignId: t.campaignId || null,
          leader: (t.leaderId && t.leaderId.fullName) ? {
            _id: t.leaderId._id,
            fullName: t.leaderId.fullName,
            phone: t.leaderId.phone,
            profilePhoto: t.leaderId.profilePhoto
          } : leaderUser ? {
            _id: leaderUser._id,
            fullName: leaderUser.fullName,
            phone: leaderUser.phone,
            profilePhoto: leaderUser.profilePhoto
          } : null,
          leaderEntersOverallCollection: Boolean(t.leaderEntersOverallCollection),
          overallCollectedAmount: t.overallCollectedAmount || 0,
          overallCollectionNotes: t.overallCollectionNotes || '',
          overallCollectionUpdatedAt: t.overallCollectionUpdatedAt || null,
          createdAt: t.createdAt,
          memberCount,
          totalDistributed,
          totalCollected,
          allocatedStock,
          issuedToMembers,
          remainingTeamStock,
          remainingWithMembers: Math.max(0, issuedToMembers - totalDistributed)
        };
      })
    );

    return res.json({ success: true, data: teamStats });
  } catch (err) {
    console.error('List teams error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch teams.' });
  }
});

// POST /api/teams - Super admin only (Creates team & optionally assigns leader/members)
router.post('/', requireRole('super_admin'), async (req, res) => {
  try {
    const { name, description, leaderId, memberIds, campaignId } = req.body;
    const check = validateRequired(req.body, ['name']);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: check.error });
    }

    const cleanName = name.trim();
    const existing = await Team.findOne({ name: cleanName, isArchived: { $ne: true } });
    if (existing) {
      return res.status(400).json({ success: false, error: 'An active team with this name already exists.' });
    }

    const activeCamp = await getActiveCampaign();
    const targetCampaignId = campaignId && isValidObjectId(campaignId) ? campaignId : activeCamp?._id;

    const team = await Team.create({
      name: cleanName,
      description: description ? description.trim() : '',
      campaignId: targetCampaignId,
      isActive: true,
      isArchived: false
    });

    // If leaderId is specified, assign as team_leader
    if (leaderId && isValidObjectId(leaderId)) {
      team.leaderId = leaderId;
      await team.save();
      const leaderUser = await User.findById(leaderId);
      if (leaderUser) {
        leaderUser.teamId = team._id;
        if (!['super_admin', 'usthad'].includes(leaderUser.role)) {
          leaderUser.role = 'team_leader';
        }
        await leaderUser.save();
      }
    }

    // If initial memberIds are specified, add them
    if (Array.isArray(memberIds) && memberIds.length > 0) {
      const validMemberIds = memberIds.filter(id => isValidObjectId(id) && id !== leaderId);
      if (validMemberIds.length > 0) {
        await User.updateMany(
          { _id: { $in: validMemberIds } },
          { $set: { teamId: team._id } }
        );
      }
    }

    await logAudit({
      entityType: 'team',
      entityId: team._id,
      action: 'create',
      newValues: { name: team.name, campaignId: targetCampaignId, leaderId: leaderId || null },
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

// PUT /api/teams/:id/leader - Assign or change Team Leader (Super Admin only)
router.put('/:id/leader', requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { leaderId } = req.body;

    if (!isValidObjectId(id) || !isValidObjectId(leaderId)) {
      return res.status(400).json({ success: false, error: 'Valid Team ID and Leader ID are required.' });
    }

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const newLeader = await User.findById(leaderId);
    if (!newLeader) {
      return res.status(404).json({ success: false, error: 'Selected member not found.' });
    }

    // Demote any existing team_leader for this team to team_member (unless super_admin/usthad)
    const oldLeaders = await User.find({ teamId: id, role: 'team_leader', _id: { $ne: leaderId } });
    for (const oldLeader of oldLeaders) {
      if (!['super_admin', 'usthad'].includes(oldLeader.role)) {
        oldLeader.role = 'team_member';
        await oldLeader.save();
      }
    }

    // Assign new leader to this team and grant team_leader role
    const oldValues = { teamId: newLeader.teamId, role: newLeader.role };
    newLeader.teamId = id;
    if (!['super_admin', 'usthad'].includes(newLeader.role)) {
      newLeader.role = 'team_leader';
    }
    await newLeader.save();
    team.leaderId = newLeader._id;
    await team.save();

    await logAudit({
      entityType: 'team',
      entityId: team._id,
      action: 'change_leader',
      oldValues,
      newValues: { leaderId: newLeader._id, leaderName: newLeader.fullName },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: `${newLeader.fullName} is now Team Leader of ${team.name}.`,
      data: {
        team,
        leader: {
          _id: newLeader._id,
          fullName: newLeader.fullName,
          phone: newLeader.phone,
          role: newLeader.role
        }
      }
    });
  } catch (err) {
    console.error('Assign team leader error:', err);
    return res.status(500).json({ success: false, error: 'Failed to assign team leader.' });
  }
});

// POST /api/teams/:id/members - Add existing member(s) to a team
router.post('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { memberIds } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid team ID.' });
    }

    const isSuperAdmin = ['super_admin', 'usthad'].includes(req.user.role);
    const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
    const isOwnLeader = req.user.role === 'team_leader' && userTeamId === id;

    if (!isSuperAdmin && !isOwnLeader) {
      return res.status(403).json({ success: false, error: 'Access denied: Only Super Admin or the Team Leader can add members to this team.' });
    }

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const ids = Array.isArray(memberIds) ? memberIds : [memberIds].filter(Boolean);
    const validIds = ids.filter(isValidObjectId);

    if (validIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide at least one valid member ID.' });
    }

    const updatedUsers = [];
    for (const memberId of validIds) {
      const userDoc = await User.findById(memberId);
      if (userDoc) {
        userDoc.teamId = id;
        if (userDoc.role === 'team_leader' && !isSuperAdmin) {
          userDoc.role = 'team_member';
        }
        await userDoc.save();
        updatedUsers.push({ _id: userDoc._id, fullName: userDoc.fullName });
      }
    }

    await logAudit({
      entityType: 'team',
      entityId: team._id,
      action: 'assign_member',
      newValues: { assignedCount: updatedUsers.length, members: updatedUsers.map(u => u._id) },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: `Successfully added ${updatedUsers.length} member(s) to ${team.name}.`,
      data: updatedUsers
    });
  } catch (err) {
    console.error('Add members to team error:', err);
    return res.status(500).json({ success: false, error: 'Failed to add members to team.' });
  }
});

// DELETE /api/teams/:id/members/:memberId - Remove member from team safely to independent state
router.delete('/:id/members/:memberId', async (req, res) => {
  try {
    const { id, memberId } = req.params;

    if (!isValidObjectId(id) || !isValidObjectId(memberId)) {
      return res.status(400).json({ success: false, error: 'Invalid team ID or member ID.' });
    }

    const isSuperAdmin = ['super_admin', 'usthad'].includes(req.user.role);
    const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
    const isOwnLeader = req.user.role === 'team_leader' && userTeamId === id;

    if (!isSuperAdmin && !isOwnLeader) {
      return res.status(403).json({ success: false, error: 'Access denied: Only Super Admin or the Team Leader can remove members from this team.' });
    }

    const userDoc = await User.findById(memberId);
    if (!userDoc) {
      return res.status(404).json({ success: false, error: 'Member not found.' });
    }

    userDoc.teamId = null;
    if (userDoc.role === 'team_leader') {
      userDoc.role = 'team_member';
    }
    await userDoc.save();

    await logAudit({
      entityType: 'team',
      entityId: id,
      action: 'unassign_member',
      newValues: { memberId: userDoc._id, fullName: userDoc.fullName },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: `${userDoc.fullName} has been removed from the team and is now an independent collector.`,
      data: { memberId: userDoc._id, teamId: null }
    });
  } catch (err) {
    console.error('Remove member from team error:', err);
    return res.status(500).json({ success: false, error: 'Failed to remove member from team.' });
  }
});

// Safe Archival Handler (Used for both POST /archive and DELETE /:id to guarantee zero data loss)
const deleteOrArchiveTeamHandler = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid team ID.' });
    }
    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }
    const isPermanent = req.method === 'DELETE' && req.query.permanent !== 'false';
    const affectedMembers = await User.find({ teamId: id });
    for (const m of affectedMembers) {
      m.teamId = null;
      if (m.role === 'team_leader') m.role = 'team_member';
      await m.save();
    }
    if (isPermanent) {
      await Team.findByIdAndDelete(id);
    } else {
      team.isActive = false;
      team.isArchived = true;
      team.archivedAt = new Date();
      team.archivedBy = req.user._id;
      await team.save();
    }
    return res.json({
      success: true,
      message: isPermanent ? `Team "${team.name}" permanently deleted.` : `Team "${team.name}" safely archived.`,
      data: team
    });
  } catch (err) {
    console.error('Team action error:', err);
    return res.status(500).json({ success: false, error: 'Failed to process team.' });
  }
};
const archiveTeamHandler = deleteOrArchiveTeamHandler;

router.post('/:id/archive', requireRole('super_admin'), archiveTeamHandler);
router.delete('/:id', requireRole('super_admin'), archiveTeamHandler);

// PUT /api/teams/:id/overall-collection - Toggle overall collection mode & update lump sum total
router.put('/:id/overall-collection', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid team ID.' });
    }

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    // Role check: super_admin, usthad, or team_leader of this team
    const isSuperAdmin = ['super_admin', 'usthad'].includes(req.user.role);
    const userTeamId = req.user.teamId ? (req.user.teamId._id || req.user.teamId).toString() : null;
    const isOwnLeader = req.user.role === 'team_leader' && userTeamId === id;

    if (!isSuperAdmin && !isOwnLeader) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied: Only Team Leader of this team or Admin can modify overall collection mode.'
      });
    }

    const { enabled, overallCollectedAmount, notes } = req.body;
    const oldValues = {
      leaderEntersOverallCollection: team.leaderEntersOverallCollection,
      overallCollectedAmount: team.overallCollectedAmount,
      overallCollectionNotes: team.overallCollectionNotes
    };

    if (enabled !== undefined) {
      team.leaderEntersOverallCollection = Boolean(enabled);
    }

    if (overallCollectedAmount !== undefined) {
      const amt = parseFloat(overallCollectedAmount);
      if (isNaN(amt) || amt < 0) {
        return res.status(400).json({ success: false, error: 'Overall collected amount must be a non-negative number.' });
      }
      team.overallCollectedAmount = amt;
    }

    if (notes !== undefined) {
      team.overallCollectionNotes = typeof notes === 'string' ? notes.trim() : '';
    }

    team.overallCollectionUpdatedAt = new Date();
    team.overallCollectionUpdatedBy = req.user._id;

    await team.save();

    await logAudit({
      entityType: 'team',
      entityId: team._id,
      action: 'update_overall_collection',
      oldValues,
      newValues: {
        leaderEntersOverallCollection: team.leaderEntersOverallCollection,
        overallCollectedAmount: team.overallCollectedAmount,
        overallCollectionNotes: team.overallCollectionNotes
      },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('team:overall_collection_updated', {
        teamId: team._id,
        leaderEntersOverallCollection: team.leaderEntersOverallCollection,
        overallCollectedAmount: team.overallCollectedAmount
      });
    }

    return res.json({
      success: true,
      message: team.leaderEntersOverallCollection
        ? `Overall collection mode enabled. Total: ₹${team.overallCollectedAmount}. Member self-entry is locked.`
        : 'Overall collection mode disabled. Individual member entry is now unlocked.',
      data: team
    });
  } catch (err) {
    console.error('Update overall collection error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update overall collection settings.' });
  }
});

export default router;
