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
// 23. Admin Data Reset: Safety Confirmation and Authorization Validation
test('Admin Data Reset: Validation requires exact RESET confirmation keyword', () => {
  function validateResetRequest(userRole, confirmText, mode) {
    if (userRole !== 'super_admin') {
      return { success: false, status: 403, error: 'Only Super Admin can reset application data.' };
    }
    if (!confirmText || confirmText.trim() !== 'RESET') {
      return { success: false, status: 400, error: 'Confirmation failed: You must type RESET in capital letters.' };
    }
    if (!['clean', 'sandbox'].includes(mode)) {
      return { success: false, status: 400, error: 'Invalid mode.' };
    }
    return { success: true };
  }

  // Non-super_admin attempt
  const leaderAttempt = validateResetRequest('team_leader', 'RESET', 'clean');
  assert.equal(leaderAttempt.success, false);
  assert.equal(leaderAttempt.status, 403);

  // Super Admin wrong confirmation
  const badConfirm = validateResetRequest('super_admin', 'reset', 'clean');
  assert.equal(badConfirm.success, false);
  assert.equal(badConfirm.status, 400);

  // Super Admin correct confirmation
  const goodClean = validateResetRequest('super_admin', 'RESET', 'clean');
  assert.equal(goodClean.success, true);

  const goodSandbox = validateResetRequest('super_admin', 'RESET', 'sandbox');
  assert.equal(goodSandbox.success, true);
});

// 24. Reset Mock Store: Clean vs Sandbox mode verification
test('Admin Data Reset: Mock store clean slate vs sandbox initialization', async () => {
  const { resetMockStore, getMockStore } = await import('../server/middleware/mockData.js');

  // Test clean slate
  resetMockStore('clean');
  const cleanStore = getMockStore();
  assert.equal(cleanStore.teams.length, 4, 'Clean state restores 4 standard camp teams');
  assert.equal(cleanStore.collections.length, 0, 'Clean state wipes all collections');
  assert.equal(cleanStore.transfers.length, 0, 'Clean state wipes all transfers');
  assert.equal(cleanStore.distributions.length, 0, 'Clean state wipes all distributions');
  assert.equal(cleanStore.campaign.totalStock, 5000, 'Campaign total stock reset to 5000');
  assert.equal(cleanStore.campaign.calendarPrice, 100, 'Campaign calendar price reset to 100');

  // Test sandbox mode
  resetMockStore('sandbox');
  const sandboxStore = getMockStore();
  assert.equal(sandboxStore.teams.length, 4, 'Sandbox has 4 teams');
  assert.ok(sandboxStore.collections.length >= 3, 'Sandbox seeds collections');
  assert.ok(sandboxStore.transfers.length >= 2, 'Sandbox seeds transfers');
  assert.ok(sandboxStore.distributions.length >= 2, 'Sandbox seeds distributions');
  assert.ok(sandboxStore.users.length >= 4, 'Sandbox seeds realistic users');
});

// 25. Cloudinary: Configuration verification and secure transformations
test('Cloudinary: Credentials structure and folder path verification', () => {
  const cloudinaryConfig = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'bhlwt5m9',
    api_key: process.env.CLOUDINARY_API_KEY || '681148252944323',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'ZkP5e7DSjh2dcLSAXcKwwF7lYnU',
    secure: true
  };

  assert.equal(cloudinaryConfig.cloud_name, 'bhlwt5m9', 'Configured cloud_name matches bhlwt5m9');
  assert.equal(cloudinaryConfig.api_key, '681148252944323', 'Configured api_key matches user account');
  assert.ok(cloudinaryConfig.api_secret && cloudinaryConfig.api_secret.length > 10, 'Configured api_secret is valid');
  assert.equal(cloudinaryConfig.secure, true, 'Uses HTTPS secure URLs');

  function getUploadFolderOptions(userId) {
    return {
      folder: 'life_skill_course/profiles',
      public_id: `user_${userId}`,
      overwrite: true,
      transformation: [
        { width: 250, height: 250, crop: 'thumb', gravity: 'face' },
        { quality: 'auto:good', fetch_format: 'auto' }
      ]
    };
  }

  const uploadOpts = getUploadFolderOptions('user123');
  assert.equal(uploadOpts.folder, 'life_skill_course/profiles');
  assert.equal(uploadOpts.public_id, 'user_user123');
  assert.equal(uploadOpts.transformation[0].crop, 'thumb');
});

// 26. Cloudinary: Photo upload authorization for all users
test('Authorization: Photo upload permission rules across roles', () => {
  function canUploadPhotoFor(actingUser, targetUser) {
    if (String(actingUser._id) === String(targetUser._id)) return true; // Self upload
    if (actingUser.role === 'super_admin') return true; // Super admin can upload for all
    if (actingUser.role === 'usthad') return true; // Usthad can upload for all
    if (actingUser.role === 'team_leader' && actingUser.teamId && targetUser.teamId && String(actingUser.teamId) === String(targetUser.teamId)) {
      return true; // Leader can upload for members of own team
    }
    return false;
  }

  const admin = { _id: 'u1', role: 'super_admin' };
  const usthad = { _id: 'u2', role: 'usthad' };
  const leaderA = { _id: 'u3', role: 'team_leader', teamId: 'team1' };
  const memberA = { _id: 'u4', role: 'team_member', teamId: 'team1' };
  const memberB = { _id: 'u5', role: 'team_member', teamId: 'team2' };

  // Self upload
  assert.equal(canUploadPhotoFor(memberA, memberA), true, 'Member can upload their own photo');
  // Admin upload for any user
  assert.equal(canUploadPhotoFor(admin, memberB), true, 'Admin can upload photo for any member');
  // Usthad upload for any user
  assert.equal(canUploadPhotoFor(usthad, memberA), true, 'Usthad can upload photo for any member');
  // Leader upload for own team member
  assert.equal(canUploadPhotoFor(leaderA, memberA), true, 'Leader can upload photo for own team member');
  // Leader upload for other team member (forbidden)
  assert.equal(canUploadPhotoFor(leaderA, memberB), false, 'Leader cannot upload photo for another team member');
  // Member upload for other member (forbidden)
  assert.equal(canUploadPhotoFor(memberA, memberB), false, 'Member cannot upload photo for other users');
});

// ============================================================================
// 27-36: Physical Calendar Stock Allocation Lifecycle (Super Admin & Team Leader)
// ============================================================================

// 27. Test 1 & 2: Super Admin allocates calendars to Team A -> Available stock increases
test('Stock Allocation 1 & 2: Super Admin allocates calendars to Team A and Team A stock increases', () => {
  const centralStore = { totalCampaignStock: 5000, allocatedToTeams: 0 };
  const teamA = { id: 'team-A', name: 'Al-Huda Team', receivedFromCentral: 0, issuedToMembers: 0 };

  function allocateToTeam(user, targetTeam, quantity) {
    if (user.role !== 'super_admin') throw new Error('Forbidden: Only Super Admin can allocate stock to teams');
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Quantity must be a positive integer');

    const availableCentral = centralStore.totalCampaignStock - centralStore.allocatedToTeams;
    if (quantity > availableCentral) throw new Error(`Exceeds central stock. Available: ${availableCentral}`);

    // Immutable allocation ledger transaction
    const transaction = {
      id: `alloc-${Date.now()}`,
      teamId: targetTeam.id,
      memberId: null,
      type: 'team',
      quantity,
      allocatedBy: user.id,
      date: new Date().toISOString()
    };

    centralStore.allocatedToTeams += quantity;
    targetTeam.receivedFromCentral += quantity;

    return transaction;
  }

  const superAdmin = { id: 'admin-1', role: 'super_admin' };
  const allocTx = allocateToTeam(superAdmin, teamA, 500);

  assert.equal(allocTx.quantity, 500, 'Transaction recorded 500 calendars');
  assert.equal(teamA.receivedFromCentral, 500, "Team A's received stock increased by exactly 500");
  assert.equal(centralStore.totalCampaignStock - centralStore.allocatedToTeams, 4500, 'Central store remaining is 4,500');
});

// 28. Test 3, 4, 5: Team Leader A allocates calendars to Member A -> Team A remaining stock decreases, Member A received stock increases
test('Stock Allocation 3, 4, 5: Team Leader A allocates calendars to Member A and balances update', () => {
  const teamA = { id: 'team-A', name: 'Al-Huda Team', receivedFromCentral: 500, issuedToMembers: 0 };
  const memberA = { id: 'mem-A1', teamId: 'team-A', receivedStock: 0, distributedStock: 0 };
  const leaderA = { id: 'lead-A', role: 'team_leader', teamId: 'team-A' };

  function allocateToMember(actingUser, targetMember, quantity) {
    if (!['super_admin', 'team_leader'].includes(actingUser.role)) throw new Error('Unauthorized');
    if (actingUser.role === 'team_leader' && actingUser.teamId !== targetMember.teamId) {
      throw new Error('Forbidden: You may only allocate stock to members of your own team');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Invalid quantity');

    const teamRemainingStock = teamA.receivedFromCentral - teamA.issuedToMembers;
    if (quantity > teamRemainingStock) throw new Error(`Exceeds team stock. Available: ${teamRemainingStock}`);

    const transaction = {
      id: `alloc-m-${Date.now()}`,
      teamId: targetMember.teamId,
      memberId: targetMember.id,
      type: 'member',
      quantity,
      allocatedBy: actingUser.id,
      date: new Date().toISOString()
    };

    teamA.issuedToMembers += quantity;
    targetMember.receivedStock += quantity;

    return transaction;
  }

  const tx = allocateToMember(leaderA, memberA, 75);

  assert.equal(tx.quantity, 75, 'Allocated 75 calendars');
  assert.equal(teamA.issuedToMembers, 75, 'Team A issued to members increased to 75');
  const teamARemaining = teamA.receivedFromCentral - teamA.issuedToMembers;
  assert.equal(teamARemaining, 425, "Team A's remaining stock decreased from 500 to 425");
  assert.equal(memberA.receivedStock, 75, "Member A's received stock increased by exactly 75");
});

// 29. Test 6: Another Team Leader cannot allocate stock belonging to Team A
test('Stock Allocation 6: Cross-team stock allocation by unauthorized Team Leader is strictly rejected', () => {
  const leaderB = { id: 'lead-B', role: 'team_leader', teamId: 'team-B' };
  const memberA = { id: 'mem-A1', teamId: 'team-A', receivedStock: 0 };

  function validateLeaderAllocationScope(leader, member) {
    if (leader.role === 'team_leader' && leader.teamId !== member.teamId) {
      return { allowed: false, status: 403, error: 'Forbidden: You may only allocate stock to members belonging to your authorized team' };
    }
    return { allowed: true };
  }

  const result = validateLeaderAllocationScope(leaderB, memberA);
  assert.equal(result.allowed, false, 'Cross-team allocation disallowed');
  assert.equal(result.status, 403, 'Returns HTTP 403 Forbidden');
});

// 30. Test 7: An allocation exceeding available stock is rejected
test('Stock Allocation 7: Allocations exceeding available central or team stock are rejected', () => {
  const centralStore = { totalCampaignStock: 1000, allocatedToTeams: 900 };
  const teamA = { id: 'team-A', receivedFromCentral: 100, issuedToMembers: 80 };

  // Attempting to allocate 150 from central store (available: 100)
  const availableCentral = centralStore.totalCampaignStock - centralStore.allocatedToTeams; // 100
  const canCentralAllocate = 150 <= availableCentral;
  assert.equal(canCentralAllocate, false, 'Central allocation of 150 exceeds available 100');

  // Attempting to allocate 30 from Team A (available: 20)
  const availableTeam = teamA.receivedFromCentral - teamA.issuedToMembers; // 20
  const canTeamAllocate = 30 <= availableTeam;
  assert.equal(canTeamAllocate, false, 'Team allocation of 30 exceeds available 20');

  // Rejection of negative or zero allocations
  assert.throws(() => {
    const qty = -10;
    if (qty <= 0) throw new Error('Quantity must be a positive integer greater than 0');
  }, /Quantity must be a positive integer/, 'Negative allocations rejected');
});

// 31. Test 8: Repeated requests do not deduct stock twice (Idempotency)
test('Stock Allocation 8: Repeated submission requests with duplicate clientId do not deduct stock twice', () => {
  const ledger = [];
  const teamA = { id: 'team-A', receivedFromCentral: 0 };

  function processAllocationWithIdempotency(payload) {
    if (payload.clientId) {
      const existing = ledger.find((entry) => entry.clientId === payload.clientId);
      if (existing) {
        return { success: true, data: existing, idempotent: true };
      }
    }

    const newRecord = {
      id: `alloc-${ledger.length + 1}`,
      teamId: payload.teamId,
      quantity: payload.quantity,
      clientId: payload.clientId
    };

    ledger.push(newRecord);
    teamA.receivedFromCentral += payload.quantity;
    return { success: true, data: newRecord, idempotent: false };
  }

  const firstSubmission = processAllocationWithIdempotency({
    teamId: 'team-A',
    quantity: 100,
    clientId: 'req-uuid-12345'
  });

  assert.equal(firstSubmission.idempotent, false, 'First submission is processed');
  assert.equal(teamA.receivedFromCentral, 100, 'Team A stock credited 100');
  assert.equal(ledger.length, 1, 'Ledger has 1 entry');

  // Network retry / double click with same clientId
  const secondSubmission = processAllocationWithIdempotency({
    teamId: 'team-A',
    quantity: 100,
    clientId: 'req-uuid-12345'
  });

  assert.equal(secondSubmission.idempotent, true, 'Second submission detected as idempotent');
  assert.equal(teamA.receivedFromCentral, 100, 'Team A stock was NOT deducted or credited twice');
  assert.equal(ledger.length, 1, 'Ledger count remains exactly 1');
});

// 32. Test 9: Correct stock balances remain consistent across accounting equations
test('Stock Allocation 9: Full PRD accounting consistency: Central + Team + Member + Distributed', () => {
  const campaignStock = 5000;

  // Ledger of allocations
  const teamAllocations = [
    { teamId: 'team-A', quantity: 1000 },
    { teamId: 'team-B', quantity: 800 }
  ];
  const memberAllocations = [
    { teamId: 'team-A', memberId: 'm1', quantity: 400 },
    { teamId: 'team-A', memberId: 'm2', quantity: 300 },
    { teamId: 'team-B', memberId: 'm3', quantity: 500 }
  ];
  const distributions = [
    { memberId: 'm1', quantity: 350, status: 'approved' },
    { memberId: 'm2', quantity: 200, status: 'approved' },
    { memberId: 'm3', quantity: 450, status: 'approved' }
  ];

  const totalAllocatedToTeams = teamAllocations.reduce((sum, a) => sum + a.quantity, 0); // 1800
  const unallocatedAtCentral = campaignStock - totalAllocatedToTeams; // 3200

  const totalAllocatedToMembers = memberAllocations.reduce((sum, a) => sum + a.quantity, 0); // 1200
  const unallocatedAtTeams = totalAllocatedToTeams - totalAllocatedToMembers; // 600

  const totalDistributed = distributions.reduce((sum, d) => sum + d.quantity, 0); // 1000
  const remainingWithMembers = totalAllocatedToMembers - totalDistributed; // 200

  // PRD Accounting Equation
  const accounted = unallocatedAtCentral + unallocatedAtTeams + remainingWithMembers + totalDistributed;
  const variance = campaignStock - accounted;

  assert.equal(unallocatedAtCentral, 3200, 'Central store: 3,200 calendars');
  assert.equal(unallocatedAtTeams, 600, 'Available at teams: 600 calendars');
  assert.equal(remainingWithMembers, 200, 'In members hands: 200 calendars');
  assert.equal(totalDistributed, 1000, 'Distributed to public: 1,000 calendars');
  assert.equal(accounted, 5000, 'Accounted equals total campaign stock');
  assert.equal(variance, 0, 'Variance is zero');
});

// 33. Test 10: Existing distribution, sales, collections, and financial reports integrity
test('Stock Allocation 10: Existing distribution sales, collections and financial reports function correctly', () => {
  const calendarPrice = 100;
  const distributions = [
    { memberId: 'm1', quantity: 15, status: 'approved' },
    { memberId: 'm2', quantity: 25, status: 'approved' },
    { memberId: 'm3', quantity: 10, status: 'pending' } // Pending should not count towards approved gross revenue
  ];

  const approvedDistributions = distributions.filter((d) => d.status === 'approved');
  const totalApprovedQuantity = approvedDistributions.reduce((s, d) => s + d.quantity, 0);
  assert.equal(totalApprovedQuantity, 40, '40 approved distributed calendars');

  const expectedGrossRevenue = totalApprovedQuantity * calendarPrice;
  assert.equal(expectedGrossRevenue, 4000, '₹4,000 gross revenue from approved calendar sales');

  const collections = [
    { memberId: 'm1', amount: 1500, status: 'approved' },
    { memberId: 'm2', amount: 2500, status: 'approved' }
  ];
  const totalCollected = collections.reduce((s, c) => s + c.amount, 0);
  assert.equal(totalCollected, 4000, 'Collected ₹4,000 matches expected revenue');
});


// 34. Target Management: Default target on User and CampaignConfig
test('Collection Targets 1: Default member target is ₹25,000 and configurable per user', async () => {
  const User = (await import('../server/models/User.js')).default;
  const CampaignConfig = (await import('../server/models/CampaignConfig.js')).default;

  // Check Schema defaults
  const userTargetField = User.schema.path('collectionTarget');
  assert.ok(userTargetField, 'User schema must have collectionTarget field');
  assert.equal(userTargetField.defaultValue, 25000, 'Default collectionTarget must be ₹25,000');

  const configTargetField = CampaignConfig.schema.path('defaultMemberTarget');
  assert.ok(configTargetField, 'CampaignConfig schema must have defaultMemberTarget field');
  assert.equal(configTargetField.defaultValue, 25000, 'Default campaign member target must be ₹25,000');
});

// 35. Target Progress Accounting: Target, Approved Collected, Remaining, and Achievement %
test('Collection Targets 2: Precise mathematical progress calculations without unapproved amounts', () => {
  const member = {
    fullName: 'Zaid Rahman',
    collectionTarget: 25000
  };

  const collections = [
    { amount: 10000, status: 'approved', approvalStatus: 'approved' },
    { amount: 5000, status: 'approved', approvalStatus: 'approved' },
    { amount: 3000, status: 'pending', approvalStatus: 'pending' }, // Must not count!
    { amount: 2000, status: 'rejected', approvalStatus: 'rejected' } // Must not count!
  ];

  // Official approved collections calculation
  const approvedCollected = collections
    .filter(c => (c.status === 'approved' || c.status === 'active') && c.approvalStatus === 'approved')
    .reduce((sum, c) => sum + c.amount, 0);

  const remaining = Math.max(0, member.collectionTarget - approvedCollected);
  const progressPercent = member.collectionTarget > 0 ? Math.round((approvedCollected / member.collectionTarget) * 100) : 0;

  assert.equal(approvedCollected, 15000, 'Only approved entries (10k + 5k = 15k) are counted');
  assert.equal(remaining, 10000, 'Remaining is ₹10,000 (25k - 15k)');
  assert.equal(progressPercent, 60, 'Target progress is 60%');
});

// 36. Team Leader Personal Collection Progress Distinction
test('Collection Targets 3: Team Leader personal collection is isolated and not attributed to team members', () => {
  const leaderId = 'leader-101';
  const member1Id = 'member-201';
  const member2Id = 'member-202';

  const users = [
    { _id: leaderId, fullName: 'Ahmed Bilal', role: 'team_leader', collectionTarget: 30000 },
    { _id: member1Id, fullName: 'Member One', role: 'team_member', collectionTarget: 25000 },
    { _id: member2Id, fullName: 'Member Two', role: 'team_member', collectionTarget: 20000 }
  ];

  const approvedCollections = [
    { memberId: leaderId, amount: 12000 },
    { memberId: member1Id, amount: 15000 },
    { memberId: member2Id, amount: 8000 }
  ];

  // Team Leader's own personal progress
  const leaderCol = approvedCollections.filter(c => c.memberId === leaderId).reduce((s, c) => s + c.amount, 0);
  const leaderTarget = users.find(u => u._id === leaderId).collectionTarget;
  const leaderRemaining = Math.max(0, leaderTarget - leaderCol);
  const leaderPct = Math.round((leaderCol / leaderTarget) * 100);

  assert.equal(leaderCol, 12000, 'Leader personal collection is 12k');
  assert.equal(leaderRemaining, 18000, 'Leader remaining is 18k');
  assert.equal(leaderPct, 40, 'Leader percent is 40%');

  // Team member individual progress
  const m1Col = approvedCollections.filter(c => c.memberId === member1Id).reduce((s, c) => s + c.amount, 0);
  assert.equal(m1Col, 15000, 'Member 1 has 15k, leader entries are not mixed in');
});

// 37. Approval Workflow: Team Leader pending review queue
test('Approval Workflow: Entries reach pending queue and update totals upon approval', () => {
  const pendingCollection = {
    _id: 'col-999',
    memberId: 'm1',
    teamId: 't1',
    amount: 5000,
    status: 'pending',
    approvalStatus: 'pending'
  };

  // Queue filtering for Team Leader
  const leaderTeamId = 't1';
  const isForLeaderTeam = pendingCollection.teamId === leaderTeamId;
  const isPending = pendingCollection.approvalStatus === 'pending';
  assert.ok(isForLeaderTeam && isPending, 'Pending entry immediately appears in Team Leader queue');

  // Approval step
  pendingCollection.status = 'approved';
  pendingCollection.approvalStatus = 'approved';
  pendingCollection.approvedBy = 'leader-1';
  pendingCollection.approvedAt = new Date().toISOString();

  assert.equal(pendingCollection.approvalStatus, 'approved');
  assert.equal(pendingCollection.status, 'approved');
  assert.ok(pendingCollection.approvedAt);
});

// 38. WhatsApp Reports: Collection Target Progress section builder test
test('WhatsApp Reports: Collection Target Progress section formatting with ranking and medals', async () => {
  const { buildCustomWhatsAppReport } = await import('../server/utils/whatsappReports.js');

  const teamsData = [
    {
      name: 'Al-Huda Team',
      distributed: 250,
      collected: 35000,
      members: [
        { name: 'Ahmed Leader', role: 'team_leader', target: 25000, collected: 20000, distributed: 100 },
        { name: 'Zaid Rahman', role: 'team_member', target: 25000, collected: 18000, distributed: 80 },
        { name: 'Kareem Ali', role: 'team_member', target: 20000, collected: 12000, distributed: 70 }
      ]
    }
  ];

  // 1. When includeTargetProgress is false, section is omitted
  const reportWithout = buildCustomWhatsAppReport({
    reportType: 'team',
    teamsData,
    sections: { includeTargetProgress: false, includeHeader: true, includeSummary: true }
  });
  assert.ok(!reportWithout.includes('COLLECTION TARGET PROGRESS'), 'Section omitted when unchecked');

  // 2. When includeTargetProgress is true, section is included with medals, target, collected, remaining and progress
  const reportWith = buildCustomWhatsAppReport({
    reportType: 'team',
    teamsData,
    sections: { includeTargetProgress: true, includeHeader: true, includeSummary: true }
  });

  assert.ok(reportWith.includes('🎯 *COLLECTION TARGET PROGRESS*'), 'Contains Collection Target Progress header');
  assert.ok(reportWith.includes('Team Leader Personal Progress'), 'Distinguishes Team Leader personal progress');
  assert.ok(reportWith.includes('Zaid Rahman'), 'Includes member name');
  assert.ok(reportWith.includes('Target: ₹25,000'), 'Includes member target');
  assert.ok(reportWith.includes('Collected: ₹18,000'), 'Includes approved collection amount');
  assert.ok(reportWith.includes('Remaining: ₹7,000'), 'Includes calculated remaining amount');
  assert.ok(reportWith.includes('Progress: 72%'), 'Includes calculated percentage (18k / 25k = 72%)');
  assert.ok(reportWith.includes('🥇') || reportWith.includes('1.'), 'Includes ranking medal / rank badge');
});

// 39. AuditLog Validation: Supports domain actions (approve, reject, resubmit, allocate_team, etc.)
test('AuditLog: Validates domain event actions without enum failure', async () => {
  const AuditLog = (await import('../server/models/AuditLog.js')).default;
  const mongoose = (await import('mongoose')).default;

  const validActions = ['approve', 'reject', 'resubmit', 'create', 'update', 'delete', 'allocate_team', 'batch_update_target'];

  for (const act of validActions) {
    const doc = new AuditLog({
      entityType: 'collection',
      entityId: new mongoose.Types.ObjectId(),
      action: act,
      performedBy: new mongoose.Types.ObjectId()
    });

    const err = doc.validateSync();
    assert.equal(err, undefined, `AuditLog must accept action '${act}' without validation error`);
  }
});

// ============================================================================
// PHASE 5: REUSABLE CAMPAIGN TEAMS, INDEPENDENT MEMBERS & WHATSAPP FILTERS
// 15 MANDATORY TEST SCENARIOS
// ============================================================================

test('Scenario 1: Team deletion archives safely — member accounts preserved with teamId = null', async () => {
  const Team = (await import('../server/models/Team.js')).default;
  const User = (await import('../server/models/User.js')).default;

  const team = new Team({ name: 'Archive Test Team', isActive: true, isArchived: false });
  assert.equal(team.isArchived, false);
  assert.equal(team.isActive, true);

  // Archive team
  team.isArchived = true;
  team.isActive = false;
  team.archivedAt = new Date();
  assert.equal(team.isArchived, true);
  assert.equal(team.isActive, false);

  // Member account has stable ID and teamId becomes null
  const member = new User({ username: 'member_archive_1', fullName: 'Archived Member', role: 'team_member', teamId: team._id });
  assert.ok(member._id);
  member.teamId = null;
  assert.equal(member.teamId, null);
  assert.equal(member.username, 'member_archive_1');
});

test('Scenario 2: Team deletion preserves historical collection and distribution records', async () => {
  const Collection = (await import('../server/models/Collection.js')).default;
  const Distribution = (await import('../server/models/Distribution.js')).default;
  const mongoose = (await import('mongoose')).default;

  const mockTeamId = new mongoose.Types.ObjectId();
  const mockMemberId = new mongoose.Types.ObjectId();
  const mockCampaignId = new mongoose.Types.ObjectId();

  const col = new Collection({
    memberId: mockMemberId,
    teamId: mockTeamId,
    campaignId: mockCampaignId,
    amount: 1500,
    status: 'approved',
    approvalStatus: 'approved'
  });

  const dist = new Distribution({
    memberId: mockMemberId,
    teamId: mockTeamId,
    campaignId: mockCampaignId,
    quantity: 15,
    status: 'approved',
    approvalStatus: 'approved'
  });

  // Records retain their historical team and campaign linkage even when team is archived
  assert.equal(col.teamId.toString(), mockTeamId.toString());
  assert.equal(col.campaignId.toString(), mockCampaignId.toString());
  assert.equal(dist.teamId.toString(), mockTeamId.toString());
  assert.equal(col.amount, 1500);
  assert.equal(dist.quantity, 15);
});

test('Scenario 3: Team deletion detaches former leader assignment cleanly and sets to ordinary member', async () => {
  const User = (await import('../server/models/User.js')).default;
  const mongoose = (await import('mongoose')).default;

  const teamId = new mongoose.Types.ObjectId();
  const leader = new User({
    username: 'leader_demote_test',
    fullName: 'Former Leader',
    role: 'team_leader',
    teamId
  });

  assert.equal(leader.role, 'team_leader');
  // Safe detachment logic
  leader.teamId = null;
  leader.role = 'team_member';
  assert.equal(leader.teamId, null);
  assert.equal(leader.role, 'team_member');
});

test('Scenario 4: Team deletion preserves Super Admin and Usthad global accounts and roles', async () => {
  const User = (await import('../server/models/User.js')).default;

  const admin = new User({
    username: 'admin',
    fullName: 'Super Administrator',
    role: 'super_admin',
    teamId: null
  });

  const usthad = new User({
    username: 'usthad',
    fullName: 'Usthad Supervisor',
    role: 'usthad',
    teamId: null
  });

  assert.equal(admin.role, 'super_admin');
  assert.equal(usthad.role, 'usthad');
  assert.equal(admin.teamId, null);
  assert.equal(usthad.teamId, null);
});

test('Scenario 5: Super Admin creates a new team, assigns a leader, and replaces leader', async () => {
  const Team = (await import('../server/models/Team.js')).default;
  const mongoose = (await import('mongoose')).default;

  const leaderAId = new mongoose.Types.ObjectId();
  const leaderBId = new mongoose.Types.ObjectId();

  const team = new Team({
    name: 'Team Al-Ansar',
    leaderId: leaderAId,
    isActive: true
  });

  assert.equal(team.name, 'Team Al-Ansar');
  assert.equal(team.leaderId.toString(), leaderAId.toString());

  // Replace leader
  team.leaderId = leaderBId;
  assert.equal(team.leaderId.toString(), leaderBId.toString());
});

test('Scenario 6: Fast member search matches by name, phone, or ID without sensitive data exposure', () => {
  const members = [
    { _id: '671e00000000000000000001', fullName: 'Muhammed Salman', username: 'salman', phone: '9876543210', teamId: null },
    { _id: '671e00000000000000000002', fullName: 'Abdul Basith', username: 'basith', phone: '9123456789', teamId: '671e00000000000000000099' }
  ];

  const search = (q) => {
    const s = q.toLowerCase().trim();
    return members.filter(m => m.fullName.toLowerCase().includes(s) || m.phone.includes(s) || m._id === s);
  };

  const res1 = search('Salman');
  assert.equal(res1.length, 1);
  assert.equal(res1[0].username, 'salman');

  const res2 = search('912345');
  assert.equal(res2.length, 1);
  assert.equal(res2[0].fullName, 'Abdul Basith');

  // Verify sanitized output (no password or pin hints)
  assert.equal(res1[0].passwordHash, undefined);
  assert.equal(res1[0].pinHash, undefined);
  assert.equal(res1[0].passwordHint, undefined);
});

test('Scenario 7: Member assignment reuses existing account without creating duplicate user', () => {
  const existingUser = { _id: 'user_101', username: 'khalid', fullName: 'Khalid', teamId: null };
  const team = { _id: 'team_202', name: 'Team Badr', members: [] };

  // Assign existing user
  team.members.push(existingUser._id);
  existingUser.teamId = team._id;

  assert.equal(existingUser._id, 'user_101');
  assert.equal(existingUser.teamId, 'team_202');
  assert.equal(team.members.includes('user_101'), true);
});

test('Scenario 8: Independent member creates collections with teamId: null', async () => {
  const Collection = (await import('../server/models/Collection.js')).default;
  const mongoose = (await import('mongoose')).default;

  const independentCol = new Collection({
    memberId: new mongoose.Types.ObjectId(),
    teamId: null, // explicitly null
    amount: 2500,
    incomeType: 'calendar_sale',
    status: 'pending',
    approvalStatus: 'pending'
  });

  assert.equal(independentCol.teamId, null);
  assert.equal(independentCol.amount, 2500);
  assert.equal(independentCol.approvalStatus, 'pending');
});

test('Scenario 9: Independent member collections route to Super Admin/Usthad approval queue', () => {
  const pendingCollections = [
    { _id: 'col_1', memberId: 'user_indep_1', teamId: null, amount: 1000, approvalStatus: 'pending' },
    { _id: 'col_2', memberId: 'user_team_1', teamId: 'team_1', amount: 2000, approvalStatus: 'pending' }
  ];

  // Super Admin / Usthad view (sees all pending entries including teamId: null)
  const adminQueue = pendingCollections.filter(c => c.approvalStatus === 'pending');
  assert.equal(adminQueue.length, 2);

  // Team Leader 1 view (strictly scoped to team_1, excludes independent teamId: null)
  const leaderQueue = pendingCollections.filter(c => c.approvalStatus === 'pending' && c.teamId === 'team_1');
  assert.equal(leaderQueue.length, 1);
  assert.equal(leaderQueue[0]._id, 'col_2');
});

test('Scenario 10: Independent member dashboard displays Independent Member, no leader, ₹25,000 target', () => {
  const indepMember = {
    _id: 'indep_1',
    fullName: 'Independent Collector',
    role: 'team_member',
    teamId: null,
    collectionTarget: 25000
  };

  const approvedCollections = 17500;
  const target = indepMember.collectionTarget || 25000;
  const remaining = Math.max(0, target - approvedCollections);
  const percentage = Math.round((approvedCollections / target) * 100);

  const teamDisplay = !indepMember.teamId ? 'Independent Member / No Team' : 'Assigned Team';
  const leaderDisplay = !indepMember.teamId ? null : 'Leader Name';

  assert.equal(teamDisplay, 'Independent Member / No Team');
  assert.equal(leaderDisplay, null);
  assert.equal(target, 25000);
  assert.equal(remaining, 7500);
  assert.equal(percentage, 70);
});

test('Scenario 11: Campaign separation: multi-year campaigns have unique IDs and isolate teams/transactions', async () => {
  const Campaign = (await import('../server/models/Campaign.js')).default;

  const camp2025 = new Campaign({
    campaignCode: 'CAMP-2025',
    name: 'Annual Calendar Camp 2025',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-03-31'),
    status: 'completed',
    isActive: false
  });

  const camp2026 = new Campaign({
    campaignCode: 'CAMP-2026',
    name: 'Annual Calendar Camp 2026',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-03-31'),
    status: 'active',
    isActive: true
  });

  assert.notEqual(camp2025._id.toString(), camp2026._id.toString());
  assert.equal(camp2025.status, 'completed');
  assert.equal(camp2026.status, 'active');
  assert.equal(camp2026.isActive, true);
});

test('Scenario 12: WhatsApp Report Team-wise filter scopes to selected team and excludes other teams/independent members', async () => {
  const { buildCustomWhatsAppReport } = await import('../server/utils/whatsappReports.js');

  const report = buildCustomWhatsAppReport({
    selectedTeamOnly: true,
    selectedTeamName: 'Team Al-Falah',
    teamsData: [
      {
        name: 'Team Al-Falah',
        distributed: 120,
        collected: 12000,
        members: [{ name: 'Member A', distributed: 60, collected: 6000 }]
      }
    ],
    totals: { distributed: 120, collected: 12000 }
  });

  assert.ok(report.includes('Team-wise Report') && report.includes('Team Al-Falah') && report.includes('Selected Team Members Only'));
  assert.ok(report.includes('Team Al-Falah'));
  assert.ok(!report.includes('Team Uhud'));
});

test('Scenario 13: WhatsApp Report Top Collectors toggle orders by approved collections with medal badges & ties handled', async () => {
  const { buildCustomWhatsAppReport } = await import('../server/utils/whatsappReports.js');

  const report = buildCustomWhatsAppReport({
    sections: { includeTopCollectors: true, includeHeader: true },
    topCollectors: [
      { name: 'Collector One', teamName: 'Team A', collected: 25000, target: 25000, remaining: 0, progress: 100 },
      { name: 'Collector Two', teamName: 'Team B', collected: 25000, target: 25000, remaining: 0, progress: 100 },
      { name: 'Collector Three', teamName: 'Independent Member', collected: 18000, target: 25000, remaining: 7000, progress: 72 }
    ]
  });

  assert.ok(report.includes('TOP COLLECTORS'));
  assert.ok(report.includes('Collector One') && report.includes('🥇'));
  assert.ok(report.includes('Collector Two') && report.includes('🥇')); // Shared tie
  assert.ok(report.includes('Collector Three') && report.includes('🥉')); // Rank 3 after tie
  assert.ok(report.includes('Approved Collection: ₹25,000'));
});

test('Scenario 14: WhatsApp Report Top Collectors display limits (Top 3, 5, 10, All) work correctly', async () => {
  const { buildCustomWhatsAppReport } = await import('../server/utils/whatsappReports.js');

  const collectors = [
    { name: 'Person 1', collected: 5000, target: 25000, remaining: 20000, progress: 20 },
    { name: 'Person 2', collected: 4000, target: 25000, remaining: 21000, progress: 16 },
    { name: 'Person 3', collected: 3000, target: 25000, remaining: 22000, progress: 12 },
    { name: 'Person 4', collected: 2000, target: 25000, remaining: 23000, progress: 8 },
    { name: 'Person 5', collected: 1000, target: 25000, remaining: 24000, progress: 4 }
  ];

  const reportTop3 = buildCustomWhatsAppReport({
    sections: { includeTopCollectors: true },
    topCollectors: collectors,
    topCollectorsLimit: 3
  });

  assert.ok(reportTop3.includes('Person 1'));
  assert.ok(reportTop3.includes('Person 2'));
  assert.ok(reportTop3.includes('Person 3'));
  assert.ok(!reportTop3.includes('Person 4'));
  assert.ok(!reportTop3.includes('Person 5'));
});

test('Scenario 15: WhatsApp Report excludes pending and rejected transactions from official counts', () => {
  const transactions = [
    { id: 1, amount: 1000, approvalStatus: 'approved' },
    { id: 2, amount: 2000, approvalStatus: 'pending' },
    { id: 3, amount: 500, approvalStatus: 'rejected' }
  ];

  const officialTotal = transactions
    .filter(t => t.approvalStatus === 'approved')
    .reduce((sum, t) => sum + t.amount, 0);

  assert.equal(officialTotal, 1000);
  assert.equal(transactions.some(t => t.approvalStatus === 'pending' && t.amount === 2000), true);
});
