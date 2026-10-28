export function buildProgressBar(pct) {
  const percent = Math.min(100, Math.max(0, Math.round(pct || 0)));
  const filled = Math.min(10, Math.max(0, Math.round(percent / 10)));
  const empty = 10 - filled;
  return "[" + "▓".repeat(filled) + "░".repeat(empty) + "] " + percent + "%";
}

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
  memberMetrics = null,
  reportType = 'daily', // 'daily' | 'overall' | 'team' | 'member' | 'area'
  dateStr = '',
  scopeTitle = 'All Teams (Campaign-Wide)',
  campaignName = '',
  selectedTeamOnly = false,
  selectedTeamName = '',
  topCollectors = [],
  topCollectorsLimit = 10,
  role = 'super_admin',
  campaignConfig = { totalStock: 5000, calendarPrice: 100 },
  teamsData = [],
  items = [],
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
    includeTopCollectors: false,
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
  // Dedicated Individual Member Metrics Report
  if (reportType === "member" && memberMetrics) {
    lines.push("👤 *INDIVIDUAL MEMBER METRICS REPORT*");
    lines.push("");
    lines.push("*Member Name:* " + (memberMetrics.fullName || memberMetrics.name || "Member"));
    lines.push("*Team:* " + (memberMetrics.teamName || "Independent Collector"));
    lines.push("*Role:* " + (memberMetrics.role || "Member").replace("_", " ").toUpperCase());
    lines.push("*Phone:* " + (memberMetrics.phone || "N/A"));
    lines.push("");
    lines.push("*Performance Metrics:*");
    lines.push("- Calendars Distributed: " + formatNumber(memberMetrics.distributed || 0) + " units");
    lines.push("- Approved Collections: " + formatINR(memberMetrics.collected || 0));
    lines.push("- Collection Target: " + formatINR(memberMetrics.target || 25000));
    lines.push("- Remaining to Target: " + formatINR(Math.max(0, (memberMetrics.target || 25000) - (memberMetrics.collected || 0))));
    const memPct = (memberMetrics.target || 25000) > 0 ? Math.round(((memberMetrics.collected || 0) / (memberMetrics.target || 25000)) * 100) : 0;
    lines.push("- Target Progress: " + buildProgressBar(memPct));
    lines.push("");
  }


  const canViewFinancials = ['super_admin', 'usthad', 'team_leader'].includes(role);
  const isSingleTeam = reportType === 'team' || role === 'team_leader' || (teamsData && teamsData.length === 1);

  // 1. Header
  if (sections.includeHeader !== false) {
    lines.push(`📅 *LIFE SKILL COURSE — CALENDAR CAMP*`);
    if (campaignName) {
      lines.push(`🎯 *Campaign:* ${campaignName}`);
    }
    if (selectedTeamOnly && (selectedTeamName || (teamsData.length === 1 && teamsData[0].name))) {
      const tName = selectedTeamName || teamsData[0].name;
      lines.push(`👥 *Team-wise Report:* ${tName} (Selected Team Members Only)`);
    } else if (scopeTitle && scopeTitle !== 'All Teams (Campaign-Wide)') {
      lines.push(`📍 *Scope:* ${scopeTitle}`);
    }
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

  // Top Collectors Section
  if ((sections.includeTopCollectors || sections.showTopCollectors) && canViewFinancials) {
    lines.push(`🌟 *TOP COLLECTORS*`);
    lines.push(``);

    let listToRank = [];
    if (topCollectors && topCollectors.length > 0) {
      listToRank = topCollectors;
    } else {
      teamsData.forEach((team) => {
        (team.members || []).forEach((m) => {
          if ((m.collected || 0) > 0) {
            const target = m.target !== undefined && m.target !== null ? m.target : 25000;
            const collected = m.collected || 0;
            const remaining = Math.max(0, target - collected);
            const progress = target > 0 ? Math.round((collected / target) * 100) : 0;
            listToRank.push({
              name: m.name,
              teamName: team.name,
              target,
              collected,
              remaining,
              progress
            });
          }
        });
      });
    }

    const rankedCollectors = assignRanks(listToRank, 'collected');
    const limit = topCollectorsLimit > 0 ? parseInt(topCollectorsLimit, 10) : rankedCollectors.length;
    const displayedCollectors = rankedCollectors.slice(0, limit);

    if (displayedCollectors.length === 0) {
      lines.push(`_No approved collections recorded yet._`);
      lines.push(``);
    } else {
      displayedCollectors.forEach((m) => {
        const teamSuffix = (!selectedTeamOnly && m.teamName && m.teamName !== 'Independent Member' && m.teamName !== 'No Team') ? ` (${m.teamName})` : (m.teamName ? ` (${m.teamName})` : '');
        lines.push(`${getMedal(m.rank)}*${m.name}*${teamSuffix}`);
        lines.push(`- Approved Collection: ${formatINR(m.collected)}`);
        lines.push(`- Target: ${formatINR(m.target)}`);
        lines.push(`- Remaining: ${formatINR(m.remaining)}`);
        lines.push(`- Achieved: ${m.progress}%`);
        lines.push(``);
      });
    }
  }

  // 4. Optional Collection Target Progress Section
  if (sections.includeTargetProgress && canViewFinancials) {
    lines.push(`🎯 *COLLECTION TARGET PROGRESS*`);
    lines.push(``);

    if (teamsData && teamsData.length > 0) {
      if (isSingleTeam) {
        const team = teamsData[0];
        const allMembers = team.members || [];
        const leaderMember = allMembers.find((m) => m.role === 'team_leader');
        const regularMembers = allMembers.filter((m) => m.role !== 'team_leader');

        if (leaderMember) {
          const lTarget = leaderMember.target !== undefined && leaderMember.target !== null ? leaderMember.target : 25000;
          const lCollected = leaderMember.collected || 0;
          const lRemaining = Math.max(0, lTarget - lCollected);
          const lPct = lTarget > 0 ? Math.round((lCollected / lTarget) * 100) : 0;

          lines.push(`👤 *Team Leader Personal Progress:*`);
          lines.push(`*${leaderMember.name}*`);
          lines.push(`- Target: ${formatINR(lTarget)}`);
          lines.push(`- Collected: ${formatINR(lCollected)}`);
          lines.push(`- Remaining: ${formatINR(lRemaining)}`);
          lines.push(`- Progress: ${lPct}%`);
          lines.push(``);
        }

        const rankedMembers = assignRanks(
          regularMembers.map((m) => {
            const target = m.target !== undefined && m.target !== null ? m.target : 25000;
            const collected = m.collected || 0;
            const remaining = Math.max(0, target - collected);
            const progress = target > 0 ? Math.round((collected / target) * 100) : 0;
            return { ...m, target, collected, remaining, progress };
          }),
          'collected'
        );

        if (rankedMembers.length === 0) {
          lines.push(`_No team members listed for target tracking._`);
          lines.push(``);
        } else {
          rankedMembers.forEach((m) => {
            lines.push(`${getMedal(m.rank)}*${m.name}*`);
            lines.push(`- Target: ${formatINR(m.target)}`);
            lines.push(`- Collected: ${formatINR(m.collected)}`);
            lines.push(`- Remaining: ${formatINR(m.remaining)}`);
            lines.push(`- Progress: ${m.progress}%`);
            lines.push(``);
          });
        }
      } else {
        // Super Admin / Campaign-wide: include authorized members across all teams
        const allCampaignMembers = [];
        teamsData.forEach((team) => {
          (team.members || []).forEach((m) => {
            const target = m.target !== undefined && m.target !== null ? m.target : 25000;
            const collected = m.collected || 0;
            const remaining = Math.max(0, target - collected);
            const progress = target > 0 ? Math.round((collected / target) * 100) : 0;
            allCampaignMembers.push({
              ...m,
              teamName: team.name,
              target,
              collected,
              remaining,
              progress
            });
          });
        });

        const rankedAll = assignRanks(allCampaignMembers, 'collected');
        if (rankedAll.length === 0) {
          lines.push(`_No member records available._`);
          lines.push(``);
        } else {
          rankedAll.forEach((m) => {
            lines.push(`${getMedal(m.rank)}*${m.name}* (${m.teamName})`);
            lines.push(`- Target: ${formatINR(m.target)}`);
            lines.push(`- Collected: ${formatINR(m.collected)}`);
            lines.push(`- Remaining: ${formatINR(m.remaining)}`);
            lines.push(`- Progress: ${m.progress}%`);
            lines.push(``);
          });
        }
      }
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
