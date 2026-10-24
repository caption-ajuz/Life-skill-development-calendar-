/**
 * WhatsApp Report Builder & Formatter for Life Skill Course Campaign
 * Markazul Hidayathil Islamiyya — Annual Calendar Camp
 * WhatsApp markdown compatible (*bold*, _italic_), clean layout, dynamic data.
 */

export function formatINR(val) {
  const num = Math.round(Number(val) || 0);
  return '₹' + num.toLocaleString('en-IN');
}

export function formatQty(val) {
  const num = Math.round(Number(val) || 0);
  return num.toLocaleString('en-IN');
}

export function formatRankBadge(rank) {
  if (rank === 1) return '🥇 1. ';
  if (rank === 2) return '🥈 2. ';
  if (rank === 3) return '🥉 3. ';
  return `${rank}. `;
}

export function getMedal(rank) {
  if (rank === 1) return '🥇 ';
  if (rank === 2) return '🥈 ';
  if (rank === 3) return '🥉 ';
  return `${rank}. `;
}

/**
 * Assigns competition ranks with tie handling: equal totals share rank, next rank skips.
 */
export function assignRanks(list, valueKey = 'distributed') {
  if (!list || !list.length) return [];
  const sorted = [...list].sort((a, b) => (b[valueKey] || 0) - (a[valueKey] || 0));
  let currentRank = 1;
  return sorted.map((item, idx, arr) => {
    if (idx > 0 && (item[valueKey] || 0) < (arr[idx - 1][valueKey] || 0)) {
      currentRank = idx + 1;
    }
    return { ...item, rank: currentRank };
  });
}

/**
 * Custom WhatsApp Report Builder matching exact Life Skill Course specifications:
 * - Dynamic actual figures (never dummy data)
 * - Excludes unapproved entries from official counts and rankings
 * - Clean section toggles (Header, Summary, Team Performance, Rankings, Handover/Cash, Totals)
 * - Strict team scoping for Team Leaders
 */
export function buildCustomWhatsAppReport({
  reportType = 'daily', // 'daily' | 'overall' | 'team' | 'member' | 'area'
  dateStr = '',
  scopeTitle = 'All Teams (Campaign-Wide)',
  role = 'super_admin',
  campaignConfig = { totalStock: 5000, calendarPrice: 100 },
  teamsData = [], // [{ name, distributed, collected, members: [{ name, distributed, collected }] }]
  items = [], // fallback flat items if teamsData is not structured
  totals = {
    distributed: 0,
    collected: 0,
    transferred: 0,
    teamsCount: 0,
    membersCount: 0,
    areasCount: 0
  },
  offlinePendingCount = 0,
  sections = {
    includeHeader: true,
    includeSummary: true,
    includeBreakdown: true,
    includeLeaderboard: true,
    includeCollectionRanking: false,
    includeHandoverStatus: true,
    includeZeroActivity: false,
    includeOfflineNotice: true,
    includeFooter: true
  },
  customNote = '',
  customFooterNote = ''
}) {
  const note = (customNote || customFooterNote || '').trim();
  const lines = [];

  const canViewFinancials = ['super_admin', 'usthad', 'team_leader'].includes(role);
  const isSingleTeam = reportType === 'team' || role === 'team_leader' || (teamsData && teamsData.length === 1);

  // 1. Header
  if (sections.includeHeader !== false) {
    lines.push(`📅 *LIFE SKILL COURSE — CALENDAR CAMP*`);
    lines.push(``);
    lines.push(`Date: ${dateStr || new Date().toLocaleDateString('en-IN')}`);
    lines.push(``);
  }

  // 2. Summary
  if (sections.includeSummary !== false) {
    if (isSingleTeam && teamsData.length === 1) {
      lines.push(`📊 *TEAM SUMMARY*`);
      lines.push(``);
      lines.push(`- Team: ${teamsData[0].name}`);
      lines.push(`- Calendars Distributed/Sold Today: ${formatQty(totals.distributed)}`);
      lines.push(`- Today's Collection: ${formatINR(totals.collected)}`);
    } else {
      lines.push(`📊 *OVERALL SUMMARY*`);
      lines.push(``);
      lines.push(`- Total Teams: ${totals.teamsCount || teamsData.length || 0}`);
      lines.push(`- Calendars Distributed/Sold Today: ${formatQty(totals.distributed)}`);
      lines.push(`- Today's Collection: ${formatINR(totals.collected)}`);
    }

    if (sections.includeHandoverStatus && canViewFinancials) {
      const inHandCash = Math.max(0, (totals.collected || 0) - (totals.transferred || 0));
      lines.push(`- In-Hand Cash: ${formatINR(inHandCash)}`);
      if (totals.transferred > 0) {
        lines.push(`- Confirmed Handover: ${formatINR(totals.transferred)}`);
      }
    }
    lines.push(``);
  }

  // 3. Team-wise performance & Member Rankings
  if (sections.includeBreakdown !== false || sections.includeLeaderboard !== false) {
    if (teamsData && teamsData.length > 0) {
      if (!isSingleTeam) {
        lines.push(`🏆 *TEAM-WISE PERFORMANCE*`);
        lines.push(``);
      }

      teamsData.forEach((team, tIdx) => {
        // Filter members with zero activity if requested
        let members = team.members || [];
        if (!sections.includeZeroActivity) {
          members = members.filter((m) => (m.distributed || 0) > 0 || (m.collected || 0) > 0);
        }

        const teamHeading = isSingleTeam
          ? `🏆 *${team.name} PERFORMANCE*`
          : `*Team ${tIdx + 1} — ${team.name}*`;

        lines.push(teamHeading);
        lines.push(``);
        lines.push(`- Calendars Distributed/Sold Today: ${formatQty(team.distributed)}`);
        lines.push(`- Today's Collection: ${formatINR(team.collected)}`);
        lines.push(``);

        // Calendar Ranking
        if (sections.includeLeaderboard !== false) {
          lines.push(`Calendar Ranking`);
          const rankedByDist = assignRanks(members, 'distributed');
          if (rankedByDist.length === 0) {
            lines.push(`_No approved calendar distributions recorded._`);
          } else {
            rankedByDist.forEach((m) => {
              lines.push(`${formatRankBadge(m.rank)}${m.name} — ${formatQty(m.distributed)} calendars`);
            });
          }
          lines.push(``);
        }

        // Optional Collection Ranking
        if (sections.includeCollectionRanking && canViewFinancials) {
          lines.push(`Collection Ranking`);
          const rankedByCol = assignRanks(members, 'collected');
          if (rankedByCol.length === 0) {
            lines.push(`_No approved collections recorded._`);
          } else {
            rankedByCol.forEach((m) => {
              lines.push(`${formatRankBadge(m.rank)}${m.name} — ${formatINR(m.collected)}`);
            });
          }
          lines.push(``);
        }
      });
    } else if (items && items.length > 0) {
      // Fallback flat items ranking
      lines.push(`🏆 *PERFORMANCE RANKING*`);
      lines.push(``);
      const rankedItems = assignRanks(items, 'distributed');
      rankedItems.forEach((m) => {
        lines.push(`${formatRankBadge(m.rank)}${m.name} — ${formatQty(m.distributed)} calendars`);
      });
      lines.push(``);
    }
  }

  // 4. Campaign Total or Team Total
  if (sections.includeSummary !== false) {
    const totalTitle = isSingleTeam ? `📌 *TEAM TOTAL*` : `📌 *CAMPAIGN TOTAL*`;
    lines.push(totalTitle);
    lines.push(``);
    lines.push(`- Total Calendars Distributed/Sold Today: ${formatQty(totals.distributed)}`);
    lines.push(`- Total Collection Today: ${formatINR(totals.collected)}`);
  }

  // 5. Offline sync note
  if (sections.includeOfflineNotice !== false && offlinePendingCount > 0) {
    lines.push(``);
    lines.push(`⚠️ _Note: Includes ${offlinePendingCount} local offline entries pending sync._`);
  }

  // 6. Custom Note & Footer
  if (note) {
    lines.push(``);
    lines.push(`📝 *Note:* ${note}`);
  }

  if (sections.includeFooter !== false) {
    lines.push(``);
    lines.push(`_Markazul Hidayathil Islamiyya_`);
  }

  return lines.join('\n');
}

export function buildDailyReport(options) {
  return buildCustomWhatsAppReport({ reportType: 'daily', ...options });
}

export function buildOverallReport(options) {
  return buildCustomWhatsAppReport({ reportType: 'overall', ...options });
}
