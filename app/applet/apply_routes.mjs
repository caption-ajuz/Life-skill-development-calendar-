import fs from 'fs';

// 1. UPDATE server/routes/reports.js
let repFile = fs.readFileSync('server/routes/reports.js', 'utf8');

if (!repFile.includes('let memberMetrics = null;')) {
  const memberFetchBlock = `    let memberMetrics = null;
    const resolvedMemberId = req.query.memberId || req.query.targetMemberId;
    if (resolvedMemberId && isValidObjectId(resolvedMemberId)) {
      const mDoc = await User.findById(resolvedMemberId).populate('teamId', 'name');
      if (mDoc) {
        const [mDist, mCol] = await Promise.all([
          Distribution.aggregate([
            { $match: { memberId: mDoc._id, status: { $in: ['active', 'approved'] } } },
            { $group: { _id: null, total: { $sum: '$quantity' } } }
          ]),
          Collection.aggregate([
            { $match: { memberId: mDoc._id, status: 'approved' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ]);
        memberMetrics = {
          _id: mDoc._id,
          fullName: mDoc.fullName,
          username: mDoc.username,
          phone: mDoc.phone,
          role: mDoc.role,
          teamName: mDoc.teamId ? mDoc.teamId.name : 'Independent Member',
          distributed: mDist[0] ? mDist[0].total : 0,
          collected: mCol[0] ? mCol[0].total : 0,
          target: mDoc.collectionTarget !== undefined && mDoc.collectionTarget !== null ? mDoc.collectionTarget : 25000
        };
      }
    }\n`;

  repFile = repFile.replace(
    'const reportText = buildCustomWhatsAppReport({',
    memberFetchBlock + '    const reportText = buildCustomWhatsAppReport({\n      memberMetrics,'
  );
  fs.writeFileSync('server/routes/reports.js', repFile, 'utf8');
  console.log('Updated server/routes/reports.js');
}

// 2. UPDATE server/routes/stock.js
let stockFile = fs.readFileSync('server/routes/stock.js', 'utf8');

// In allocate-team: auto expand total stock for Super Admin
if (!stockFile.includes('config.totalStock = currentlyAllocatedToTeams + qty;')) {
  stockFile = stockFile.replace(
    'if (qty > availableCentralStock) {',
    `if (qty > availableCentralStock) {
      config.totalStock = currentlyAllocatedToTeams + qty;
      await config.save();
    }
    if (false) {`
  );
}

// In allocate-member: allow independent members for super_admin
stockFile = stockFile.replace(
  "if (!memberTeamId) {\n      return res.status(400).json({ success: false, error: 'Member is not assigned to any team.' });\n    }",
  `if (!memberTeamId && req.user.role !== 'super_admin') {
      return res.status(400).json({ success: false, error: 'Member is not assigned to any team.' });
    }`
);

fs.writeFileSync('server/routes/stock.js', stockFile, 'utf8');
console.log('Updated server/routes/stock.js');

// 3. UPDATE server/routes/users.js (ADD DELETE /:id)
let usersFile = fs.readFileSync('server/routes/users.js', 'utf8');

if (!usersFile.includes("router.delete('/:id'")) {
  const deleteRoute = `// DELETE /api/users/:id - Permanently delete inactive account (Super Admin only)
router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    if (user.role === 'super_admin' || user.username === 'ajash.admin') {
      return res.status(403).json({ success: false, error: 'Cannot delete the Super Admin account.' });
    }
    if (user.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Only inactive accounts can be permanently deleted. Please deactivate this account first.'
      });
    }

    const Team = (await import('../models/Team.js')).default;
    await Team.updateMany({ leaderId: id }, { $set: { leaderId: null } });

    await User.findByIdAndDelete(id);

    await logAudit({
      entityType: 'user',
      entityId: id,
      action: 'delete',
      oldValues: { username: user.username, fullName: user.fullName, role: user.role },
      performedBy: req.user._id,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: \`User account @\${user.username} (\${user.fullName}) permanently deleted.\`
    });
  } catch (err) {
    console.error('Delete user error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete user account.' });
  }
});\n\n`;

  usersFile = usersFile.replace('export default router;', deleteRoute + 'export default router;');
  fs.writeFileSync('server/routes/users.js', usersFile, 'utf8');
  console.log('Updated server/routes/users.js with DELETE /api/users/:id');
}

// 4. UPDATE server/routes/teams.js (Support permanent delete)
let teamsFile = fs.readFileSync('server/routes/teams.js', 'utf8');
if (!teamsFile.includes('Team.findByIdAndDelete')) {
  teamsFile = teamsFile.replace(
    'const archiveTeamHandler = async (req, res) => {',
    `const deleteOrArchiveTeamHandler = async (req, res) => {
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
      message: isPermanent ? \`Team "\${team.name}" permanently deleted.\` : \`Team "\${team.name}" safely archived.\`,
      data: team
    });
  } catch (err) {
    console.error('Team action error:', err);
    return res.status(500).json({ success: false, error: 'Failed to process team.' });
  }
};
const archiveTeamHandler = deleteOrArchiveTeamHandler;`
  );
  fs.writeFileSync('server/routes/teams.js', teamsFile, 'utf8');
  console.log('Updated server/routes/teams.js');
}
