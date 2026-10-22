/**
 * WhatsApp Report Formatter for Life Skill Course Campaign
 * Inspired by structured SSF Membership Campaign WhatsApp bulletins:
 * Clean, compact, emoji-balanced, WhatsApp markdown compatible (*bold*, _italic_).
 */

export function formatINR(val) {
  const num = Math.round(Number(val) || 0);
  return '₹' + num.toLocaleString('en-IN');
}

export function formatQty(val) {
  const num = Math.round(Number(val) || 0);
  return num.toLocaleString('en-IN');
}

function makeProgressBar(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const filledCount = Math.round((p / 100) * 10);
  const emptyCount = 10 - filledCount;
  return `[${'█'.repeat(filledCount)}${'░'.repeat(emptyCount)}] ${p.toFixed(1)}%`;
}

function getMedal(rank) {
  if (rank === 1) return '🥇 ';
  if (rank === 2) return '🥈 ';
  if (rank === 3) return '🥉 ';
  return `${rank}. `;
}

/**
 * Generate Daily Campaign Report
 */
export function buildDailyReport({
  dateStr,
  scopeTitle = 'All Teams (Campaign-Wide)',
  role = 'super_admin',
  items = [], // [{ name, distributed, collected, transferred }]
  totals = { distributed: 0, collected: 0, transferred: 0, areasCount: 0, membersCount: 0 },
  offlinePendingCount = 0
}) {
  const pendingHandover = Math.max(0, totals.collected - totals.transferred);
  const divider = '━━━━━━━━━━━━━━━━━━━━';

  let lines = [
    `📊 *MARKAZUL HIDAYATHIL ISLAMIYYA*`,
    `*LIFE SKILL COURSE — DAILY CAMPAIGN REPORT*`,
    divider,
    `📅 *Date:* ${dateStr}`,
    `🎯 *Scope:* ${scopeTitle}`,
    divider,
    ``,
    `*📊 DAILY BREAKDOWN & ACTIVITY*`
  ];

  if (!items || items.length === 0) {
    lines.push(`_No distributions or collections recorded for this date._`);
  } else {
    items.forEach((item, index) => {
      const num = index + 1;
      const dist = formatQty(item.distributed);
      const col = formatINR(item.collected);
      lines.push(`${num}. *${item.name}*`);
      lines.push(`   📦 ${dist} calendars  |  💰 ${col}`);
      if (item.transferred > 0) {
        lines.push(`   ✅ Handed Over: ${formatINR(item.transferred)}`);
      }
    });
  }

  lines.push(``);
  lines.push(divider);
  lines.push(`*📈 DAILY SUMMARY TOTALS*`);
  lines.push(`📦 Calendars Distributed: *${formatQty(totals.distributed)}*`);
  lines.push(`💰 Total Collected: *${formatINR(totals.collected)}*`);
  lines.push(`✅ Confirmed Handed Over: *${formatINR(totals.transferred)}*`);
  lines.push(`⏳ In-Hand / Pending Handover: *${formatINR(pendingHandover)}*`);
  if (totals.areasCount > 0) {
    lines.push(`📍 Areas Visited: *${totals.areasCount}*`);
  }
  if (totals.membersCount > 0) {
    lines.push(`👥 Active Field Members: *${totals.membersCount}*`);
  }

  if (offlinePendingCount > 0) {
    lines.push(``);
    lines.push(`⚠️ _Note: Includes ${offlinePendingCount} local offline entries waiting to sync._`);
  }

  lines.push(divider);
  lines.push(`✨ *Markazul Hidayathil Islamiyya*`);
  lines.push(`_Annual Calendar Camp Management Portal_`);

  return lines.join('\n');
}

/**
 * Generate Overall Progress Report with Leaderboard Rankings
 */
export function buildOverallReport({
  timestampStr,
  scopeTitle = 'All Teams (Campaign-Wide)',
  role = 'super_admin',
  campaignConfig = { totalStock: 5000, calendarPrice: 100 },
  rankedItems = [], // [{ name, distributed, collected, transferred, rank }]
  totals = { distributed: 0, collected: 0, transferred: 0, teamsCount: 0, membersCount: 0, areasCount: 0 },
  offlinePendingCount = 0
}) {
  const divider = '━━━━━━━━━━━━━━━━━━━━';
  const totalStock = campaignConfig.totalStock || 5000;
  const remainingStock = Math.max(0, totalStock - totals.distributed);
  const completionPercent = totalStock > 0 ? (totals.distributed / totalStock) * 100 : 0;
  const pendingHandover = Math.max(0, totals.collected - totals.transferred);
  const progressBar = makeProgressBar(completionPercent);

  let lines = [
    `🏆 *MARKAZUL HIDAYATHIL ISLAMIYYA*`,
    `*LIFE SKILL COURSE — OVERALL PROGRESS REPORT*`,
    divider,
    `🕒 *As on:* ${timestampStr}`,
    `🎯 *Scope:* ${scopeTitle}`,
    divider,
    ``,
    `*📌 OVERALL CAMPAIGN STATUS*`,
    `📦 Total Campaign Target: *${formatQty(totalStock)}*`,
    `📤 Distributed to Date: *${formatQty(totals.distributed)}* (${completionPercent.toFixed(1)}%)`,
    `📦 Remaining Stock: *${formatQty(remainingStock)}*`,
    `📊 Progress: ${progressBar}`,
    `💰 Total Collections: *${formatINR(totals.collected)}*`,
    `✅ Confirmed Handovers: *${formatINR(totals.transferred)}*`,
    `⏳ Pending Handover Balance: *${formatINR(pendingHandover)}*`,
    ``,
    divider,
    `*🏅 LEADERBOARD & RANKINGS*`
  ];

  if (!rankedItems || rankedItems.length === 0) {
    lines.push(`_No progress data recorded yet._`);
  } else {
    // Dense ranked list
    rankedItems.forEach((item) => {
      const prefix = getMedal(item.rank);
      const share = totals.distributed > 0 ? ((item.distributed / totals.distributed) * 100).toFixed(1) : '0.0';
      lines.push(`${prefix}*${item.name}*`);
      lines.push(`   📦 ${formatQty(item.distributed)} (${share}%)  |  💰 ${formatINR(item.collected)}`);
      if (item.transferred > 0) {
        lines.push(`   ✅ Handed: ${formatINR(item.transferred)}`);
      }
    });
  }

  lines.push(``);
  lines.push(divider);
  lines.push(`*👥 PARTICIPATION SUMMARY*`);
  if (totals.teamsCount > 0) lines.push(`🏷️ Active Teams: *${totals.teamsCount}*`);
  if (totals.membersCount > 0) lines.push(`👤 Total Active Members: *${totals.membersCount}*`);
  if (totals.areasCount > 0) lines.push(`📍 Visited Areas: *${totals.areasCount}*`);

  if (offlinePendingCount > 0) {
    lines.push(``);
    lines.push(`⚠️ _Note: Includes ${offlinePendingCount} local offline entries waiting to sync._`);
  }

  lines.push(divider);
  lines.push(`✨ *Markazul Hidayathil Islamiyya*`);
  lines.push(`_Leadership & Life Skill Development Camp_`);

  return lines.join('\n');
}
