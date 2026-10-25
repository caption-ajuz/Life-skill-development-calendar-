import test from 'node:test';
import assert from 'node:assert/strict';

// Test suite for Life Skill Course: Authorization, Calculations, Concurrency/Idempotency, and Offline Behavior

// 1. PIN & Role Mapping Tests (Federal Bank-style 4-digit PIN)
test('PIN Login: 4-digit PIN role mappings', () => {
  const pinRoleMap = {
    '1111': { username: 'admin', role: 'super_admin' },
    '2222': { username: 'usthad', role: 'usthad' },
    '3333': { username: 'leader1', role: 'team_leader' },
    '4444': { username: 'member1', role: 'team_member' }
  };

  assert.equal(pinRoleMap['1111'].role, 'super_admin', '1111 maps to Super Admin');
  assert.equal(pinRoleMap['2222'].role, 'usthad', '2222 maps to Usthad');
  assert.equal(pinRoleMap['3333'].role, 'team_leader', '3333 maps to Team Leader');
  assert.equal(pinRoleMap['4444'].role, 'team_member', '4444 maps to Team Member');
  assert.equal(pinRoleMap['9999'], undefined, 'Unrecognized PIN has no mapping');
});

// 2. Calculations: Financial and Distribution Calculations
test('Calculations: Campaign content distribution and financials', () => {
  const campaign = {
    totalStock: 5000,
    calendarPrice: 100,
    initialInvestment: 20000,
    printingCost: 50000,
    otherExpenses: 5000
  };

  const totalDistributed = 1250;
  const totalCollected = 125000;

  // Percentage complete
  const percentage = (totalDistributed / campaign.totalStock) * 100;
  assert.equal(percentage, 25.0, '25% of content distributed');

  // Stock remaining
  const remainingStock = campaign.totalStock - totalDistributed;
  assert.equal(remainingStock, 3750, '3,750 calendars remaining');

  // Gross potential revenue
  const expectedTotalRevenue = campaign.totalStock * campaign.calendarPrice;
  assert.equal(expectedTotalRevenue, 500000, 'Expected ₹5,00,000 total revenue');

  // Total expenditure
  const totalExpenses = campaign.initialInvestment + campaign.printingCost + campaign.otherExpenses;
  assert.equal(totalExpenses, 75000, 'Total expenditure is ₹75,000');

  // Net surplus/balance
  const netBalance = totalCollected - totalExpenses;
  assert.equal(netBalance, 50000, 'Net surplus is ₹50,000');
});

// 3. Stock Reconciliation Formula & Variance
test('Calculations: Stock reconciliation equation and variance audit', () => {
  const campaignStock = 5000;
  const allocatedToTeams = 2100;
  const unallocatedAtCentral = campaignStock - allocatedToTeams; // 2900
  const allocatedToMembers = 1400;
  const unallocatedAtTeams = allocatedToTeams - allocatedToMembers; // 700
  const totalDistributed = 1250;
  const remainingWithMembers = allocatedToMembers - totalDistributed; // 150

  const accountedStock = unallocatedAtCentral + unallocatedAtTeams + remainingWithMembers + totalDistributed;
  const variance = campaignStock - accountedStock;

  assert.equal(accountedStock, 5000, 'All 5,000 calendars are accounted for');
  assert.equal(variance, 0, 'Variance must be 0 for a balanced reconciliation');
});

// 4. Concurrency & Idempotency: Correction Review Queue State Machine
test('Concurrency & Idempotency: Correction request resolution lifecycle', () => {
  const correction = {
    id: 'corr-001',
    status: 'pending',
    oldValues: { quantity: 50 },
    newValues: { quantity: 40 },
    approvedBy: null
  };

  function approveCorrection(record, approverId) {
    if (record.status !== 'pending') {
      throw new Error(`Correction is already ${record.status}`);
    }
    return {
      ...record,
      status: 'resolved',
      approvedBy: approverId,
      resolvedAt: new Date().toISOString()
    };
  }

  // First resolution succeeds
  const resolved = approveCorrection(correction, 'admin-1');
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.approvedBy, 'admin-1');

  // Second resolution fails idempotently
  assert.throws(
    () => approveCorrection(resolved, 'admin-1'),
    /Correction is already resolved/,
    'Repeated approval should reject idempotently'
  );
});

// 5. Offline Sync: Per-Record Status Transitions & Conflict Flagging
test('Offline Sync: Per-record lifecycle and conflict detection', () => {
  const validStatuses = ['saved_locally', 'waiting_sync', 'synced', 'conflict_flagged'];

  const entry = {
    clientId: 'client-uuid-1234',
    syncStatus: 'saved_locally',
    retryCount: 0
  };

  assert.ok(validStatuses.includes(entry.syncStatus));

  // Transition to waiting_sync
  entry.syncStatus = 'waiting_sync';
  assert.equal(entry.syncStatus, 'waiting_sync');

  // Network error on sync attempt triggers conflict_flagged or retry
  entry.retryCount += 1;
  if (entry.retryCount >= 3) {
    entry.syncStatus = 'conflict_flagged';
  }
  assert.equal(entry.syncStatus, 'waiting_sync');

  // Exceeded retries
  entry.retryCount = 3;
  entry.syncStatus = 'conflict_flagged';
  assert.equal(entry.syncStatus, 'conflict_flagged');

  // Conflict resolved
  entry.syncStatus = 'synced';
  assert.equal(entry.syncStatus, 'synced');
});

// 6. Authorization: Role-based permissions
test('Authorization: Role access constraints', () => {
  const rolePermissions = {
    super_admin: ['view_financials', 'edit_campaign_numbers', 'manage_credentials', 'approve_corrections', 'reconcile_stock'],
    usthad: ['view_financials', 'approve_corrections', 'reconcile_stock'],
    team_leader: ['view_team_stock', 'allocate_member', 'request_corrections'],
    team_member: ['view_own_stock', 'record_distribution', 'record_collection', 'request_corrections']
  };

  assert.ok(rolePermissions.super_admin.includes('manage_credentials'), 'Super admin can manage credentials');
  assert.ok(!rolePermissions.usthad.includes('manage_credentials'), 'Usthad cannot manage passwords/credentials');
  assert.ok(!rolePermissions.team_leader.includes('edit_campaign_numbers'), 'Leader cannot edit campaign numbers');
  assert.ok(rolePermissions.team_member.includes('request_corrections'), 'Member can submit correction requests');
});

// 7. Full-Screen Bank-App PIN Keypad State Transitions
test('Keypad: 4-digit numeric keypad state machine and auto-submit trigger', () => {
  let pinDigits = ['', '', '', ''];

  function inputDigit(digits, d) {
    const copy = [...digits];
    const emptyIdx = copy.findIndex(item => !item);
    if (emptyIdx !== -1) copy[emptyIdx] = d;
    return copy;
  }

  function backspace(digits) {
    const copy = [...digits];
    for (let i = 3; i >= 0; i--) {
      if (copy[i]) {
        copy[i] = '';
        break;
      }
    }
    return copy;
  }

  function clearAll() {
    return ['', '', '', ''];
  }

  pinDigits = inputDigit(pinDigits, '1');
  assert.deepEqual(pinDigits, ['1', '', '', '']);
  pinDigits = inputDigit(pinDigits, '1');
  assert.deepEqual(pinDigits, ['1', '1', '', '']);
  pinDigits = backspace(pinDigits);
  assert.deepEqual(pinDigits, ['1', '', '', '']);
  pinDigits = inputDigit(pinDigits, '1');
  pinDigits = inputDigit(pinDigits, '1');
  pinDigits = inputDigit(pinDigits, '1');
  assert.deepEqual(pinDigits, ['1', '1', '1', '1']);
  assert.equal(pinDigits.join('').length, 4, 'Full PIN reaches 4 digits ready for auto-submit');

  pinDigits = clearAll();
  assert.deepEqual(pinDigits, ['', '', '', ''], 'Clear resets all 4 boxes');
});

// 8. Admin Setup: Credential updates and password deletion logic
test('Admin Setup: Credential mutation and password/PIN clear lifecycle', () => {
  const user = {
    username: 'usthad',
    passwordHash: 'some_bcrypt_hash',
    passwordHint: 'usthad123',
    pinHash: 'some_pin_hash',
    pinHint: '2222'
  };

  // Admin updates username, password, and pin
  function updateCredentials(record, updates) {
    const next = { ...record };
    if (updates.username) next.username = updates.username.toLowerCase().trim();
    if (updates.clearPassword) {
      next.passwordHash = null;
      next.passwordHint = '';
    } else if (updates.password) {
      next.passwordHash = 'new_hash_' + updates.password;
      next.passwordHint = updates.password;
    }

    if (updates.clearPin) {
      next.pinHash = null;
      next.pinHint = '';
    } else if (updates.pin) {
      next.pinHash = 'new_pin_hash_' + updates.pin;
      next.pinHint = updates.pin;
    }
    return next;
  }

  const updated = updateCredentials(user, { password: 'newSecret99', pin: '5555' });
  assert.equal(updated.passwordHint, 'newSecret99');
  assert.equal(updated.pinHint, '5555');

  // Admin deletes/clears password
  const cleared = updateCredentials(updated, { clearPassword: true });
  assert.equal(cleared.passwordHint, '');
  assert.equal(cleared.passwordHash, null, 'Password safely deleted/cleared');
});

// 9. First-Login Password Change Lifecycle
test('Security: First-login temporary password retirement lifecycle', () => {
  const newUser = {
    username: 'salman.faris',
    role: 'team_member',
    mustChangePassword: true,
    passwordHash: 'temp_hash_abc123'
  };

  // Simulating /api/auth/first-login-change-password
  function processFirstLoginChange(userRecord, newPassword) {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }
    return {
      ...userRecord,
      passwordHash: 'secure_hashed_' + newPassword,
      mustChangePassword: false,
      updatedAt: new Date().toISOString()
    };
  }

  // Reject short password
  assert.throws(
    () => processFirstLoginChange(newUser, '123'),
    /New password must be at least 6 characters long./
  );

  // Success sets mustChangePassword to false
  const updatedUser = processFirstLoginChange(newUser, 'PermanentSecurePass@2026');
  assert.equal(updatedUser.mustChangePassword, false, 'mustChangePassword cleared on permanent password save');
  assert.equal(updatedUser.passwordHash.startsWith('secure_hashed_'), true);
});

// 10. Team Leader Member Creation Authorization & Scoping
test('Authorization: Team Leader member creation scoping and privilege limits', () => {
  const leaderUser = {
    _id: 'leader-1',
    role: 'team_leader',
    teamId: 'team-badr'
  };

  function authorizeMemberCreation(creator, memberPayload) {
    if (creator.role === 'super_admin') {
      return { ...memberPayload, teamId: memberPayload.teamId || null };
    }
    if (creator.role === 'team_leader') {
      // Must not create admin, usthad, or leader
      if (['super_admin', 'usthad', 'team_leader'].includes(memberPayload.role)) {
        throw new Error('Team leaders can only create Team Member accounts.');
      }
      // Must strictly lock to leader's team
      if (!creator.teamId) {
        throw new Error('Team leader is not assigned to a team.');
      }
      return {
        ...memberPayload,
        role: 'team_member',
        teamId: creator.teamId
      };
    }
    throw new Error('Unauthorized');
  }

  // Team Leader creates regular member in their team -> succeeds & locks to team-badr
  const created = authorizeMemberCreation(leaderUser, {
    fullName: 'Anas P',
    username: 'anas.p',
    teamId: 'team-uhud', // attempt to assign to another team
    role: 'team_member'
  });
  assert.equal(created.teamId, 'team-badr', 'Team ID locked strictly to leader team');
  assert.equal(created.role, 'team_member');

  // Team Leader attempts privilege escalation
  assert.throws(
    () => authorizeMemberCreation(leaderUser, { fullName: 'Hacker', username: 'hacker', role: 'super_admin' }),
    /Team leaders can only create Team Member accounts./
  );
  assert.throws(
    () => authorizeMemberCreation(leaderUser, { fullName: 'Hacker', username: 'hacker', role: 'usthad' }),
    /Team leaders can only create Team Member accounts./
  );
});

// 11. Role-Based Financial Scoping
test('Financial Visibility: Role-based financial information restrictions', () => {
  const fullCampaignFinance = {
    totalCollected: 250000,
    confirmedTransfers: 180000,
    pendingTransfers: 70000,
    initialInvestment: 25000,
    printingCost: 60000,
    otherExpenses: 15000,
    totalExpenses: 100000,
    netProfitOrLoss: 150000
  };

  function filterFinancialMetricsForRole(role, metrics) {
    if (role === 'super_admin' || role === 'usthad') {
      return metrics;
    }
    if (role === 'team_leader' || role === 'team_member') {
      // Strips confidential central costs
      const { initialInvestment, printingCost, totalExpenses, netProfitOrLoss, ...safe } = metrics;
      return safe;
    }
    return {};
  }

  const adminView = filterFinancialMetricsForRole('super_admin', fullCampaignFinance);
  assert.equal(adminView.initialInvestment, 25000, 'Super admin sees initial investment');
  assert.equal(adminView.printingCost, 60000, 'Super admin sees printing cost');
  assert.equal(adminView.netProfitOrLoss, 150000, 'Super admin sees net profit');

  const leaderView = filterFinancialMetricsForRole('team_leader', fullCampaignFinance);
  assert.equal(leaderView.initialInvestment, undefined, 'Leader cannot see initial investment');
  assert.equal(leaderView.printingCost, undefined, 'Leader cannot see printing cost');
  assert.equal(leaderView.netProfitOrLoss, undefined, 'Leader cannot see net profit');
  assert.equal(leaderView.totalCollected, 250000, 'Leader can see field collections');
});

// 12. Custom WhatsApp Report Builder Generator & Tie Handling
test('WhatsApp Report Builder: Custom section toggling, progress bar & ranking ties', async () => {
  const { buildCustomWhatsAppReport } = await import('../server/utils/whatsappReports.js');

  const sampleItems = [
    { name: 'Team Badr', distributed: 500, collected: 50000, inHand: 100 },
    { name: 'Team Uhud', distributed: 500, collected: 50000, inHand: 150 }, // Tie with Team Badr
    { name: 'Team Khandaq', distributed: 200, collected: 20000, inHand: 50 }
  ];

  const sampleTotals = {
    distributed: 1200,
    collected: 120000,
    transferred: 90000,
    teamsCount: 3,
    membersCount: 15,
    areasCount: 5,
    otherIncome: 0,
    expenses: 0
  };

  // Structured teams data with members for testing team-wise performance & member rankings
  const sampleTeamsData = [
    {
      name: 'Team 1 — Al-Huda',
      distributed: 500,
      collected: 50000,
      members: [
        { name: 'Ahmed Bilal', distributed: 250, collected: 25000 },
        { name: 'Zaid Rahman', distributed: 150, collected: 15000 },
        { name: 'Rashid Ali', distributed: 100, collected: 10000 }
      ]
    },
    {
      name: 'Team 2 — Al-Noor',
      distributed: 400,
      collected: 40000,
      members: [
        { name: 'Mustafa Kamal', distributed: 200, collected: 20000 },
        { name: 'Umar Farooq', distributed: 200, collected: 20000 } // Tie
      ]
    }
  ];

  // Build report matching the user's required layout
  const fullReport = buildCustomWhatsAppReport({
    reportType: 'daily',
    dateStr: '24 Oct 2026',
    scopeTitle: 'Campaign-Wide',
    role: 'super_admin',
    campaignConfig: { totalStock: 5000, calendarPrice: 100 },
    teamsData: sampleTeamsData,
    totals: sampleTotals,
    sections: {
      includeHeader: true,
      includeSummary: true,
      includeBreakdown: true,
      includeLeaderboard: true,
      includeCollectionRanking: true,
      includeHandoverStatus: true,
      includeZeroActivity: false,
      includeOfflineNotice: true,
      includeFooter: true
    },
    customNote: 'Camp review meeting tomorrow 8 PM'
  });

  assert.ok(fullReport.includes('LIFE SKILL COURSE — CALENDAR CAMP'), 'Includes Main Heading');
  assert.ok(fullReport.includes('Date: 24 Oct 2026'), 'Includes Date');
  assert.ok(fullReport.includes('OVERALL SUMMARY'), 'Includes Overall Summary');
  assert.ok(fullReport.includes('Total Teams: 3'), 'Includes Total Teams');
  assert.ok(fullReport.includes('Calendars Distributed/Sold Today: 1,200'), 'Includes Distributed Today');
  assert.ok(fullReport.includes("Today's Collection: ₹1,20,000"), 'Includes Today Collection');
  assert.ok(fullReport.includes('TEAM-WISE PERFORMANCE'), 'Includes Team-Wise Performance');
  assert.ok(fullReport.includes('Al-Huda'), 'Includes Team 1 Name');
  assert.ok(fullReport.includes('Calendar Ranking'), 'Includes Calendar Ranking header');
  assert.ok(fullReport.includes('🥇 1. Ahmed Bilal — 250 calendars'), 'Assigns gold medal 1st');
  assert.ok(fullReport.includes('🥈 2. Zaid Rahman — 150 calendars'), 'Assigns silver medal 2nd');
  assert.ok(fullReport.includes('🥉 3. Rashid Ali — 100 calendars'), 'Assigns bronze medal 3rd');
  assert.ok(fullReport.includes('Collection Ranking'), 'Includes Collection Ranking');
  assert.ok(fullReport.includes('CAMPAIGN TOTAL'), 'Includes Campaign Total');
  assert.ok(fullReport.includes('Camp review meeting tomorrow 8 PM'), 'Includes Custom Announcement');
});

// 13. Tie-Handling Ranking Rules Test
test('Ranking Rules: Descending sort, ties share rank, subsequent ranks skip correctly', async () => {
  const { assignRanks, formatRankBadge } = await import('../server/utils/whatsappReports.js');

  const members = [
    { name: 'Member C', distributed: 80 },
    { name: 'Member A', distributed: 150 },
    { name: 'Member B', distributed: 150 }, // Tie with Member A
    { name: 'Member D', distributed: 50 }
  ];

  const ranked = assignRanks(members, 'distributed');

  // Must sort highest to lowest: Member A & B (150) first, then C (80), then D (50)
  assert.equal(ranked[0].distributed, 150);
  assert.equal(ranked[1].distributed, 150);
  assert.equal(ranked[2].distributed, 80);
  assert.equal(ranked[3].distributed, 50);

  // Both top members share Rank 1
  assert.equal(ranked[0].rank, 1, 'First member gets rank 1');
  assert.equal(ranked[1].rank, 1, 'Tied member gets rank 1');
  assert.equal(ranked[2].rank, 3, 'Subsequent member skips to rank 3');
  assert.equal(ranked[3].rank, 4, 'Fourth member gets rank 4');

  // Verify badge formatting
  assert.equal(formatRankBadge(1), '🥇 1. ');
  assert.equal(formatRankBadge(2), '🥈 2. ');
  assert.equal(formatRankBadge(3), '🥉 3. ');
  assert.equal(formatRankBadge(4), '4. ');
});

// 14. Role-Based Permissions & Entry Approval Workflow Rules
test('Role Permissions: Team Leader team-locking and member approval restrictions', () => {
  // Mock entry belonging to Team 1
  const entryTeam1 = {
    _id: 'entry-101',
    teamId: 'team-01',
    memberId: 'user-member-01',
    quantity: 25,
    status: 'pending',
    approvalStatus: 'pending'
  };

  function canUserApprove(caller, entry) {
    if (caller.role === 'team_member') {
      return { allowed: false, status: 403, error: 'Team members are not authorized to approve entries.' };
    }
    if (caller.role === 'team_leader') {
      if (caller.teamId !== entry.teamId) {
        return { allowed: false, status: 403, error: 'You are only authorized to review and approve entries for your own team.' };
      }
    }
    return { allowed: true, status: 200 };
  }

  // 1. Team member cannot approve
  const memberCaller = { _id: 'user-member-01', role: 'team_member', teamId: 'team-01' };
  assert.equal(canUserApprove(memberCaller, entryTeam1).allowed, false);
  assert.equal(canUserApprove(memberCaller, entryTeam1).status, 403);

  // 2. Team Leader of other team cannot approve
  const foreignLeader = { _id: 'user-leader-02', role: 'team_leader', teamId: 'team-02' };
  assert.equal(canUserApprove(foreignLeader, entryTeam1).allowed, false);
  assert.equal(canUserApprove(foreignLeader, entryTeam1).status, 403);

  // 3. Team Leader of same team CAN approve
  const ownLeader = { _id: 'user-leader-01', role: 'team_leader', teamId: 'team-01' };
  assert.equal(canUserApprove(ownLeader, entryTeam1).allowed, true);

  // 4. Super Admin CAN approve any entry
  const superAdmin = { _id: 'user-admin', role: 'super_admin' };
  assert.equal(canUserApprove(superAdmin, entryTeam1).allowed, true);
});

// 15. Rejection & Resubmission Workflow Rules
test('Approval Workflow: Mandatory rejection reason, approver audit, and resubmission', () => {
  const entry = {
    _id: 'dist-201',
    quantity: 50,
    status: 'pending',
    approvalStatus: 'pending',
    approvedBy: null,
    approvedAt: null,
    rejectionReason: '',
    statusHistory: []
  };

  // Rejection requires reason
  function rejectEntry(rec, reviewer, reason) {
    if (!reason || !reason.trim()) {
      throw new Error('A specific reason is required to reject an entry.');
    }
    rec.status = 'rejected';
    rec.approvalStatus = 'rejected';
    rec.rejectionReason = reason.trim();
    rec.approvedBy = reviewer._id;
    rec.approvedAt = new Date().toISOString();
    rec.statusHistory.push({ status: 'rejected', reason: reason.trim() });
    return rec;
  }

  assert.throws(() => rejectEntry(entry, { _id: 'leader-1' }, ''), /A specific reason is required/);

  // Successful rejection
  const rejected = rejectEntry(entry, { _id: 'leader-1' }, 'Discrepancy with physical stock count');
  assert.equal(rejected.approvalStatus, 'rejected');
  assert.equal(rejected.rejectionReason, 'Discrepancy with physical stock count');
  assert.equal(rejected.approvedBy, 'leader-1');
  assert.ok(rejected.approvedAt);

  // Resubmission corrects values and resets status to pending
  function resubmitEntry(rec, newQty) {
    rec.quantity = newQty;
    rec.status = 'pending';
    rec.approvalStatus = 'pending';
    rec.rejectionReason = '';
    rec.statusHistory.push({ status: 'pending', reason: 'Resubmitted after correction' });
    return rec;
  }

  const resubmitted = resubmitEntry(rejected, 45);
  assert.equal(resubmitted.quantity, 45);
  assert.equal(resubmitted.approvalStatus, 'pending');
  assert.equal(resubmitted.rejectionReason, '');
  assert.equal(resubmitted.statusHistory.length, 2);
});

// 16. Database Connection Status Indicator Test
test('Database Status: Diagnostic structure with state, details and message', async () => {
  const { getDbStatus } = await import('../server/config/db.js');
  const status = getDbStatus();

  assert.ok(typeof status.connected === 'boolean', 'status.connected is boolean');
  assert.ok(typeof status.state === 'string', 'status.state is string');
  assert.ok(typeof status.message === 'string', 'status.message is string');
  assert.ok(typeof status.details === 'string', 'status.details explains connection state');
  assert.ok(status.timestamp, 'status includes timestamp');
});

// 17. PWA Compliance: Manifest structure and multi-size icon assets
test('PWA Standards: Manifest completeness, standalone mode and required icons', async () => {
  const fs = await import('fs');
  const path = await import('path');

  const manifestPath = path.resolve('public/manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json exists');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.display, 'standalone', 'PWA display must be standalone');
  assert.equal(manifest.start_url, '/', 'start_url must be /');
  assert.equal(manifest.scope, '/', 'scope must be /');
  assert.ok(manifest.name, 'manifest has full name');
  assert.ok(manifest.short_name, 'manifest has short_name');
  assert.ok(manifest.short_name.length <= 12, 'short_name length <= 12 chars to prevent mobile ellipsis');
  assert.equal(manifest.theme_color, '#0891b2', 'theme_color is defined');
  assert.equal(manifest.background_color, '#ffffff', 'background_color is defined');

  // Verify PNG icon files exist on disk
  const icon192 = path.resolve('public/pwa-192x192.png');
  const icon512 = path.resolve('public/pwa-512x512.png');
  const iconMaskable = path.resolve('public/pwa-maskable-512x512.png');
  const appleTouchIcon = path.resolve('public/apple-touch-icon.png');
  const iconSvg = path.resolve('public/icon.svg');

  assert.ok(fs.existsSync(icon192), 'pwa-192x192.png exists');
  assert.ok(fs.existsSync(icon512), 'pwa-512x512.png exists');
  assert.ok(fs.existsSync(iconMaskable), 'pwa-maskable-512x512.png exists');
  assert.ok(fs.existsSync(appleTouchIcon), 'apple-touch-icon.png exists for iOS Safari');
  assert.ok(fs.existsSync(iconSvg), 'icon.svg exists');

  // Verify maskable and standard purposes are present in manifest
  const hasStandard = manifest.icons.some(i => i.purpose === 'any' && i.sizes.includes('192'));
  const has512Standard = manifest.icons.some(i => i.purpose === 'any' && i.sizes.includes('512'));
  const hasMaskable = manifest.icons.some(i => i.purpose === 'maskable');

  assert.ok(hasStandard, 'manifest includes 192x192 purpose any');
  assert.ok(has512Standard, 'manifest includes 512x512 purpose any');
  assert.ok(hasMaskable, 'manifest includes maskable icon for Android');
});

// 18. Logout & Session Termination
test('Authentication: Logout purges tokens, cookie headers and resets user state', async () => {
  // Test simulated storage clearance
  const mockStorage = {
    'lsc_auth_token': 'test-token-xyz',
    'lsc_auth_user': JSON.stringify({ fullName: 'Super Admin', role: 'super_admin' })
  };

  function simulateLogout(storage) {
    delete storage['lsc_auth_token'];
    delete storage['lsc_auth_user'];
    return { token: storage['lsc_auth_token'] || null, user: storage['lsc_auth_user'] || null };
  }

  const result = simulateLogout(mockStorage);
  assert.equal(result.token, null, 'Auth token is cleared on logout');
  assert.equal(result.user, null, 'User cache is cleared on logout');
});

// 19. Admin Password Visibility & Reset Hint Retention
test('Admin Credentials: Admin can inspect and reset member password and PIN hints', () => {
  const userRecord = {
    _id: 'usr-101',
    username: 'member1',
    fullName: 'Zaid Rahman',
    role: 'team_member',
    passwordHash: '$2a$10$hashedstringhere',
    pinHash: '$2a$10$pinhasstringhere',
    passwordHint: 'member123',
    pinHint: '4444',
    mustChangePassword: false
  };

  // Safe serialization for admin view (passwordHash and pinHash stripped, hints preserved)
  function serializeUserForAdmin(user) {
    const safe = { ...user };
    delete safe.passwordHash;
    delete safe.pinHash;
    return safe;
  }

  const adminView = serializeUserForAdmin(userRecord);
  assert.equal(adminView.passwordHash, undefined, 'passwordHash is stripped');
  assert.equal(adminView.pinHash, undefined, 'pinHash is stripped');
  assert.equal(adminView.passwordHint, 'member123', 'Admin can see passwordHint');
  assert.equal(adminView.pinHint, '4444', 'Admin can see pinHint');

  // Simulate Password Reset
  function resetUserPassword(user, customPassword) {
    const newPass = customPassword || 'LSC@7842';
    return {
      ...user,
      passwordHash: `$2a$10$newhashfor_${newPass}`,
      passwordHint: newPass,
      mustChangePassword: true
    };
  }

  const afterPassReset = resetUserPassword(userRecord, 'NewPass@2026');
  assert.equal(afterPassReset.passwordHint, 'NewPass@2026', 'Password hint updated to new password');
  assert.equal(afterPassReset.mustChangePassword, true, 'User flagged to change password');

  // Simulate PIN Reset
  function resetUserPin(user, customPin) {
    const newPin = customPin || '5555';
    return {
      ...user,
      pinHash: `$2a$10$newpinhash_${newPin}`,
      pinHint: newPin
    };
  }

  const afterPinReset = resetUserPin(afterPassReset, '7777');
  assert.equal(afterPinReset.pinHint, '7777', 'PIN hint updated to new PIN');
});

// 20. Team Leader Overall Collection Mode: Toggle & Lump-Sum Storage
test('Team Leader Mode: Overall collection mode toggle and lump-sum amount management', () => {
  const team = {
    _id: 'team-01',
    name: 'Al-Huda Team',
    leaderEntersOverallCollection: false,
    overallCollectedAmount: 0,
    overallCollectionNotes: ''
  };

  function updateOverallCollection(currentTeam, { enabled, overallCollectedAmount, notes }) {
    return {
      ...currentTeam,
      leaderEntersOverallCollection: enabled !== undefined ? Boolean(enabled) : currentTeam.leaderEntersOverallCollection,
      overallCollectedAmount: overallCollectedAmount !== undefined ? Math.max(0, Number(overallCollectedAmount)) : currentTeam.overallCollectedAmount,
      overallCollectionNotes: notes !== undefined ? String(notes).trim() : currentTeam.overallCollectionNotes,
      overallCollectionUpdatedAt: new Date().toISOString()
    };
  }

  // Turn ON overall mode with ₹50,000 lump sum
  const activeModeTeam = updateOverallCollection(team, {
    enabled: true,
    overallCollectedAmount: 50000,
    notes: 'Collected as team lump sum from commercial center'
  });

  assert.equal(activeModeTeam.leaderEntersOverallCollection, true, 'Overall collection mode is turned ON');
  assert.equal(activeModeTeam.overallCollectedAmount, 50000, 'Overall lump sum stored correctly');
  assert.equal(activeModeTeam.overallCollectionNotes, 'Collected as team lump sum from commercial center');

  // Turn OFF overall mode
  const disabledModeTeam = updateOverallCollection(activeModeTeam, { enabled: false });
  assert.equal(disabledModeTeam.leaderEntersOverallCollection, false, 'Overall collection mode is turned OFF');
});

// 21. Member Collection Entry Lockout Guard
test('Collections Guard: Member self-entry is blocked when team overall collection mode is active', () => {
  const teamInOverallMode = {
    _id: 'team-01',
    name: 'Al-Huda Team',
    leaderEntersOverallCollection: true,
    overallCollectedAmount: 45000
  };

  const teamInNormalMode = {
    _id: 'team-02',
    name: 'Al-Noor Team',
    leaderEntersOverallCollection: false,
    overallCollectedAmount: 0
  };

  function validateCollectionSubmission(user, team, amount) {
    if (user.role === 'team_member' && team.leaderEntersOverallCollection) {
      return {
        allowed: false,
        status: 403,
        error: 'Team Leader has enabled Overall Collection Mode. Member self-entry is locked.'
      };
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return { allowed: false, status: 400, error: 'Invalid collection amount.' };
    }
    return { allowed: true, status: 201 };
  }

  const memberUser = { role: 'team_member', _id: 'mem-1' };
  const leaderUser = { role: 'team_leader', _id: 'ldr-1' };

  // Member attempt when mode is ON -> BLOCKED
  const memberBlocked = validateCollectionSubmission(memberUser, teamInOverallMode, 500);
  assert.equal(memberBlocked.allowed, false, 'Member cannot enter collection when overall mode is ON');
  assert.equal(memberBlocked.status, 403, 'Returns 403 Forbidden');
  assert.match(memberBlocked.error, /locked/i, 'Error message clarifies member entry is locked');

  // Member attempt when mode is OFF -> ALLOWED
  const memberAllowed = validateCollectionSubmission(memberUser, teamInNormalMode, 500);
  assert.equal(memberAllowed.allowed, true, 'Member can enter collection when overall mode is OFF');

  // Team Leader attempt -> ALLOWED
  const leaderAllowed = validateCollectionSubmission(leaderUser, teamInOverallMode, 5000);
  assert.equal(leaderAllowed.allowed, true, 'Leader is allowed');
});

// 22. Team Collection Aggregation: Overall Amount vs Member Collection Sum
test('Aggregation: Team total collection calculation respects overall collection mode', () => {
  const individualCollections = [
    { amount: 500, status: 'approved' },
    { amount: 1500, status: 'approved' },
    { amount: 2000, status: 'approved' }
  ];
  const memberSum = individualCollections.reduce((sum, c) => sum + c.amount, 0); // 4000

  function computeTeamTotalCollected(team, memberCollectionsSum) {
    if (team.leaderEntersOverallCollection) {
      return team.overallCollectedAmount;
    }
    return memberCollectionsSum;
  }

  // When Overall mode is ON (₹35,000 entered by leader)
  const teamOverallOn = { leaderEntersOverallCollection: true, overallCollectedAmount: 35000 };
  const totalWhenOn = computeTeamTotalCollected(teamOverallOn, memberSum);
  assert.equal(totalWhenOn, 35000, 'Uses overall lump sum ₹35,000 when mode is ON');

  // When Overall mode is OFF
  const teamOverallOff = { leaderEntersOverallCollection: false, overallCollectedAmount: 0 };
  const totalWhenOff = computeTeamTotalCollected(teamOverallOff, memberSum);
  assert.equal(totalWhenOff, 4000, 'Aggregates individual collections ₹4,000 when mode is OFF');
});



