import api from '../services/api.js';
import { currentUser } from '../store/auth.js';
import { formatNumber, formatCurrency, formatDate } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Stock() {
  const user = currentUser.value;
  const isSuperAdmin = user && user.role === 'super_admin';
  const isUsthad = user && user.role === 'usthad';
  const isLeader = user && user.role === 'team_leader';
  const isMember = user && user.role === 'team_member';

  const [summary, setSummary] = useState(null);
  const [config, setConfig] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [teams, setTeams] = useState([]);
  const [teamBreakdown, setTeamBreakdown] = useState([]);
  const [allocationsHistory, setAllocationsHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'reconciliation', 'history'

  // Super Admin: Allocate to Team
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamAllocQty, setTeamAllocQty] = useState('');
  const [teamAllocNotes, setTeamAllocNotes] = useState('');
  const [submittingTeam, setSubmittingTeam] = useState(false);

  // Team Leader: Allocate to Member
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberAllocQty, setMemberAllocQty] = useState('');
  const [memberAllocNotes, setMemberAllocNotes] = useState('');
  const [submittingMember, setSubmittingMember] = useState(false);

  // Campaign config edit
  const [editConfig, setEditConfig] = useState(false);
  const [totalStockInput, setTotalStockInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [investmentInput, setInvestmentInput] = useState('');
  const [printingInput, setPrintingInput] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  const loadStockData = async () => {
    try {
      const [sumRes, cfgRes, teamsRes, reconRes, historyRes, breakdownRes] = await Promise.all([
        api.get('/api/stock/summary'),
        api.get('/api/stock/campaign'),
        api.get('/api/teams'),
        (isSuperAdmin || isUsthad) ? api.get('/api/stock/reconciliation') : Promise.resolve(null),
        api.get('/api/stock/history'),
        api.get('/api/stock/team-breakdown')
      ]);

      if (sumRes && sumRes.success) setSummary(sumRes.data);
      if (cfgRes && cfgRes.success) {
        setConfig(cfgRes.data);
        setTotalStockInput(cfgRes.data.totalStock || 0);
        setPriceInput(cfgRes.data.calendarPrice || 100);
        setInvestmentInput(cfgRes.data.initialInvestment || 0);
        setPrintingInput(cfgRes.data.printingCost || 0);
      }
      if (teamsRes && teamsRes.success) setTeams(teamsRes.data || []);
      if (reconRes && reconRes.success) setReconciliation(reconRes.data);
      if (historyRes && historyRes.success) setAllocationsHistory(historyRes.data || []);
      if (breakdownRes && breakdownRes.success) setTeamBreakdown(breakdownRes.data || []);
    } catch (err) {
      console.warn('Failed to load stock data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStockData();
  }, []);

  // Super Admin: Allocate Stock to Team
  const handleAllocateTeam = async (e) => {
    e.preventDefault();
    const qty = parseInt(teamAllocQty, 10);
    if (!selectedTeamId || isNaN(qty) || qty <= 0) {
      if (window.showToast) window.showToast('Please select a team and enter a quantity greater than 0.', 'error');
      return;
    }

    // Auto-expand central stock if allocation exceeds currently unallocated quantity
    const availableCentral = summary ? (summary.unallocatedCampaignStock || 0) : 0;

    setSubmittingTeam(true);
    // Generate an idempotent submission key
    const clientId = 'team-alloc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    try {
      const res = await api.post('/api/stock/allocate-team', {
        teamId: selectedTeamId,
        quantity: qty,
        notes: teamAllocNotes.trim(),
        clientId
      });

      if (res && res.success) {
        const teamObj = teams.find((t) => t._id === selectedTeamId);
        const teamName = teamObj ? teamObj.name : 'Team';
        if (window.showToast) window.showToast(`✓ Successfully allocated ${qty} calendars to ${teamName}!`, 'success');
        setTeamAllocQty('');
        setTeamAllocNotes('');
        setSelectedTeamId('');
        loadStockData();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Allocation failed.', 'error');
    } finally {
      setSubmittingTeam(false);
    }
  };

  // Team Leader: Allocate Stock to Member
  const handleAllocateMember = async (e) => {
    e.preventDefault();
    const qty = parseInt(memberAllocQty, 10);
    if (!selectedMemberId || isNaN(qty) || qty <= 0) {
      if (window.showToast) window.showToast('Please select a member and enter a quantity greater than 0.', 'error');
      return;
    }

    const myTeamStock = (summary && summary.teamStock) ? (summary.teamStock.remainingTeamStock || 0) : 0;
    if (qty > myTeamStock) {
      if (window.showToast) window.showToast(`Allocation exceeds your team's available stock. Maximum available: ${myTeamStock}`, 'error');
      return;
    }

    setSubmittingMember(true);
    const clientId = 'member-alloc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    try {
      const res = await api.post('/api/stock/allocate-member', {
        memberId: selectedMemberId,
        quantity: qty,
        notes: memberAllocNotes.trim(),
        clientId
      });

      if (res && res.success) {
        if (window.showToast) window.showToast(`✓ Successfully issued ${qty} calendars to team member!`, 'success');
        setMemberAllocQty('');
        setMemberAllocNotes('');
        setSelectedMemberId('');
        loadStockData();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Allocation failed.', 'error');
    } finally {
      setSubmittingMember(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await api.put('/api/stock/campaign', {
        totalStock: parseInt(totalStockInput, 10),
        calendarPrice: parseFloat(priceInput),
        initialInvestment: parseFloat(investmentInput),
        printingCost: parseFloat(printingInput)
      });
      if (window.showToast) window.showToast('Campaign numbers & calculations updated! ✓', 'success');
      setEditConfig(false);
      loadStockData();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to update configuration.', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) {
    return html`<div class="page"><div style="height: 140px;" class="skeleton"></div></div>`;
  }

  const s = summary || {};
  const r = reconciliation || {};
  const myTeam = s.teamStock || null;
  const myTeamBreakdown = teamBreakdown.length > 0 ? teamBreakdown[0] : null;

  return html`
    <div class="page">
      <!-- Page Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div>
          <h2 style="font-size: 19px; font-weight: 700; color: #0f172a; margin: 0;">
            ${isLeader ? 'Team Calendar Stock Allocation' : 'Physical Calendar Stock & Inventory'}
          </h2>
          <p style="font-size: 12px; color: var(--text-secondary); margin: 2px 0 0;">
            ${isLeader
              ? `Manage and issue calendar stock to members of ${myTeam ? myTeam.teamName : 'your team'}`
              : 'Central warehouse stock, team allocations & reconciliation ledger'}
          </p>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display: flex; gap: 8px; margin-bottom: 12px; background: #e2e8f0; padding: 4px; border-radius: 10px;">
        <button
          class="btn btn-sm ${activeTab === 'overview' ? 'btn-primary' : 'btn-outline'}"
          style="flex: 1; border: none; font-size: 12px;"
          onClick=${() => setActiveTab('overview')}
        >
          📦 ${isLeader ? 'My Team Stock' : 'Stock Overview'}
        </button>

        <button
          class="btn btn-sm ${activeTab === 'history' ? 'btn-primary' : 'btn-outline'}"
          style="flex: 1; border: none; font-size: 12px;"
          onClick=${() => setActiveTab('history')}
        >
          📜 Allocation History
        </button>

        ${(isSuperAdmin || isUsthad) ? html`
          <button
            class="btn btn-sm ${activeTab === 'reconciliation' ? 'btn-primary' : 'btn-outline'}"
            style="flex: 1; border: none; font-size: 12px;"
            onClick=${() => setActiveTab('reconciliation')}
          >
            ⚖️ Reconciliation Audit
          </button>
        ` : ''}
      </div>

      <!-- TAB 1: ALLOCATION HISTORY -->
      ${activeTab === 'history' ? html`
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div class="card-title" style="margin-bottom: 0;">Stock Allocation Transaction History</div>
            <button class="btn btn-outline btn-sm" onClick=${loadStockData}>🔄 Refresh</button>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
            Permanent ledger of all stock transactions with dates, quantities, and responsible authorized users.
          </p>

          ${allocationsHistory.length === 0 ? html`
            <div class="empty-state">No allocation transactions recorded yet.</div>
          ` : html`
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Recipient</th>
                    <th class="text-right">Quantity</th>
                    <th>Allocated By</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  ${allocationsHistory.map((alloc) => {
                    const isTeamType = !alloc.memberId;
                    const recipientName = isTeamType
                      ? (alloc.teamId ? alloc.teamId.name : 'Team')
                      : (alloc.memberId ? alloc.memberId.fullName : 'Member');
                    const allocator = alloc.allocatedBy ? alloc.allocatedBy.fullName : 'Authorized User';

                    return html`
                      <tr key=${alloc._id}>
                        <td style="font-size: 12px; color: #475569; white-space: nowrap;">
                          ${formatDate(alloc.createdAt || alloc.date)}
                        </td>
                        <td>
                          <span class="badge ${isTeamType ? 'badge-primary' : 'badge-success'}" style="font-size: 10px;">
                            ${isTeamType ? 'Central ➔ Team' : 'Team ➔ Member'}
                          </span>
                        </td>
                        <td>
                          <b>${recipientName}</b>
                          ${!isTeamType && alloc.teamId ? html`<div style="font-size: 11px; color: var(--text-secondary);">${alloc.teamId.name}</div>` : ''}
                        </td>
                        <td class="text-right" style="font-weight: 700; color: #0f172a; font-size: 14px;">
                          +${formatNumber(alloc.quantity)}
                        </td>
                        <td style="font-size: 12px;">${allocator}</td>
                        <td style="font-size: 12px; color: var(--text-secondary); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          ${alloc.notes || '—'}
                        </td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
          `}
        </div>
      ` : ''}

      <!-- TAB 2: RECONCILIATION AUDIT (SUPER ADMIN & USTHAD) -->
      ${activeTab === 'reconciliation' && (isSuperAdmin || isUsthad) ? html`
        <div class="card" style="border-left: 4px solid #059669; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div class="card-title" style="margin-bottom: 0;">Reconciliation Audit Status</div>
            <span class="badge ${r.variance === 0 ? 'badge-success' : 'badge-danger'}" style="font-size: 13px; font-weight: 700; padding: 4px 10px;">
              ${r.variance === 0 ? '✓ Balanced (0 Variance)' : `⚠️ Variance: ${r.variance} units`}
            </span>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
            Every single printed calendar is tracked across Central Warehouse, Team Allocations, Member Possession, and Distributed units.
          </p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
            <div style="padding: 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; color: var(--text-secondary);">Campaign Opening Stock</div>
              <div style="font-size: 18px; font-weight: 700; color: #0f172a;">${formatNumber(r.campaignStock || 0)}</div>
            </div>
            <div style="padding: 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; color: var(--text-secondary);">Sum Accounted For</div>
              <div style="font-size: 18px; font-weight: 700; color: #059669;">${formatNumber(r.accountedStock || 0)}</div>
            </div>
          </div>

          <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px;">Audit Equation:</div>
          <div style="background: #f1f5f9; padding: 10px; border-radius: 8px; font-family: monospace; font-size: 12px; line-height: 1.6;">
            <div>• Central Store Warehouse: <b>${formatNumber(r.unallocatedAtCentral || 0)}</b></div>
            <div>• Unallocated at Teams: <b>${formatNumber(r.unallocatedAtTeams || 0)}</b></div>
            <div>• With Members in Hand: <b>${formatNumber(r.remainingWithMembers || 0)}</b></div>
            <div>• Distributed to Public: <b>${formatNumber(r.totalDistributed || 0)}</b></div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #cbd5e1; font-weight: 700; color: #0891b2;">
              = Total Accounted: ${formatNumber(r.accountedStock || 0)} / ${formatNumber(r.campaignStock || 0)}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Team-Level Reconciliation Breakdown</div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th class="text-right">Received</th>
                  <th class="text-right">Issued to Members</th>
                  <th class="text-right">Team Stock</th>
                  <th class="text-right">Distributed</th>
                  <th class="text-right">Audit</th>
                </tr>
              </thead>
              <tbody>
                ${(r.teams || []).map((t) => html`
                  <tr key=${t.teamId}>
                    <td><b>${t.teamName}</b></td>
                    <td class="text-right">${formatNumber(t.allocatedToTeam || 0)}</td>
                    <td class="text-right">${formatNumber(t.allocatedToMembers || 0)}</td>
                    <td class="text-right" style="color: #059669; font-weight: 600;">${formatNumber(t.unallocatedInTeam || 0)}</td>
                    <td class="text-right" style="color: var(--primary); font-weight: 600;">${formatNumber(t.distributed || 0)}</td>
                    <td class="text-right">
                      <span class="badge ${t.variance === 0 ? 'badge-success' : 'badge-danger'}" style="font-size: 11px;">
                        ${t.variance === 0 ? 'OK' : t.variance}
                      </span>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- TAB 3: OVERVIEW TAB -->
      ${activeTab === 'overview' ? html`
        <!-- TEAM LEADER SPECIFIC VIEW -->
        ${isLeader ? html`
          <!-- Team Stock Status Hero Card -->
          <div class="card" style="background: linear-gradient(135deg, #059669, #0284c7); color: white; border: none; margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <div style="font-size: 12px; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.5px;">Team Stock Authorization</div>
                <div style="font-size: 22px; font-weight: 800; margin: 2px 0 6px;">${myTeam ? myTeam.teamName : 'My Team'}</div>
                <div style="font-size: 13px; opacity: 0.95;">
                  Available to Distribute to Members:
                  <b style="font-size: 22px; font-weight: 800; margin-left: 6px; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 6px;">
                    ${formatNumber(myTeam ? myTeam.remainingTeamStock : 0)}
                  </b>
                </div>
              </div>
            </div>
          </div>

          <!-- 4 Team Metrics -->
          <div class="stats-grid" style="margin-bottom: 14px;">
            <div class="stat-card">
              <div class="stat-value" style="color: #0f172a;">${formatNumber(myTeam ? myTeam.receivedFromCentral : 0)}</div>
              <div class="stat-label">Received from Central</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="color: #2563eb;">${formatNumber(myTeam ? myTeam.issuedToMembers : 0)}</div>
              <div class="stat-label">Issued to Members</div>
            </div>
            <div class="stat-card" style="border: 2px solid #10b981;">
              <div class="stat-value" style="color: #059669; font-weight: 800;">${formatNumber(myTeam ? myTeam.remainingTeamStock : 0)}</div>
              <div class="stat-label" style="font-weight: 700; color: #047857;">Remaining Team Stock</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="color: #d97706;">${formatNumber(myTeam ? myTeam.distributedByMembers : 0)}</div>
              <div class="stat-label">Distributed to Public</div>
            </div>
          </div>

          <!-- Team Leader: Issue Calendars to Member Form -->
          <div class="card" style="border-top: 4px solid #0284c7; margin-bottom: 14px;">
            <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
              <span>Issue Calendars to Team Member</span>
              <span class="badge badge-success" style="font-size: 12px;">
                Available in Team Stock: <b>${formatNumber(myTeam ? myTeam.remainingTeamStock : 0)}</b>
              </span>
            </div>
            <form onSubmit=${handleAllocateMember}>
              <div class="form-group">
                <label class="form-label">Select Team Member</label>
                <select
                  class="form-input"
                  value=${selectedMemberId}
                  onChange=${(e) => setSelectedMemberId(e.target.value)}
                  required
                >
                  <option value="">Choose member of ${myTeam ? myTeam.teamName : 'your team'}...</option>
                  ${(myTeamBreakdown ? myTeamBreakdown.members : []).map(
                    (m) => html`<option key=${m._id} value=${m._id}>
                      ${m.fullName} (@${m.username}) — Currently In Hand: ${m.remainingStock || 0}
                    </option>`
                  )}
                </select>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="form-group">
                  <label class="form-label">Quantity to Issue</label>
                  <input
                    type="number"
                    min="1"
                    max=${myTeam ? myTeam.remainingTeamStock : 0}
                    class="form-input"
                    placeholder="e.g. 25"
                    value=${memberAllocQty}
                    onInput=${(e) => setMemberAllocQty(e.target.value)}
                    required
                    style="font-size: 18px; font-weight: 700; color: #0284c7;"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Notes (Optional)</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. Batch 2 distribution"
                    value=${memberAllocNotes}
                    onInput=${(e) => setMemberAllocNotes(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                class="btn btn-primary btn-full"
                disabled=${submittingMember || !myTeam || myTeam.remainingTeamStock <= 0}
              >
                ${submittingMember
                  ? 'Issuing Calendars...'
                  : myTeam && myTeam.remainingTeamStock <= 0
                  ? 'No Team Stock Remaining'
                  : 'Confirm Allocation to Member ✓'}
              </button>
            </form>
          </div>

          <!-- Team Members Stock Table -->
          <div class="card">
            <div class="card-title">Team Member Stock Inventory</div>
            <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;">
              Track how many calendars each member has received, distributed to the public, and holds in personal stock.
            </p>
            ${(!myTeamBreakdown || myTeamBreakdown.members.length === 0) ? html`
              <div class="empty-state">No members assigned to this team yet.</div>
            ` : html`
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th class="text-right">Received</th>
                      <th class="text-right">Distributed</th>
                      <th class="text-right">In Hand</th>
                      <th class="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${myTeamBreakdown.members.map((m) => html`
                      <tr key=${m._id}>
                        <td>
                          <b>${m.fullName}</b>
                          <div style="font-size: 11px; color: var(--text-secondary);">@${m.username}</div>
                        </td>
                        <td class="text-right" style="font-weight: 600;">${formatNumber(m.allocatedStock || 0)}</td>
                        <td class="text-right" style="color: var(--primary); font-weight: 600;">${formatNumber(m.distributedStock || 0)}</td>
                        <td class="text-right" style="color: #059669; font-weight: 700;">
                          ${formatNumber(m.remainingStock || 0)}
                        </td>
                        <td class="text-center">
                          <button
                            type="button"
                            class="btn btn-outline btn-sm"
                            style="font-size: 11px; padding: 3px 8px;"
                            onClick=${() => {
                              setSelectedMemberId(m._id);
                              window.scrollTo({ top: 200, behavior: 'smooth' });
                            }}
                          >
                            + Issue
                          </button>
                        </td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        ` : html`
          <!-- SUPER ADMIN / USTHAD / GENERAL VIEW -->

          <!-- Campaign Stock Overview Card -->
          <div class="card" style="background: linear-gradient(135deg, #0891b2, #1d4ed8); color: white; border: none; margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <div style="font-size: 13px; opacity: 0.9;">Total Campaign Physical Stock</div>
                <div style="font-size: 28px; font-weight: 800; margin: 2px 0;">${formatNumber(s.totalCampaignStock || 0)}</div>
                <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">
                  Unit Price: <b>${formatCurrency(s.calendarPrice || 100)}</b> • Central Store Remaining: <b>${formatNumber(s.unallocatedCampaignStock || 0)}</b>
                </div>
              </div>
              ${isSuperAdmin ? html`
                <button
                  class="btn btn-sm"
                  style="background: rgba(255,255,255,0.25); color: white; border: none; font-weight: 600;"
                  onClick=${() => setEditConfig(!editConfig)}
                >
                  ${editConfig ? 'Cancel' : '⚙️ Edit Numbers'}
                </button>
              ` : ''}
            </div>
          </div>

          <!-- Edit Stock & Calculations Config Form -->
          ${editConfig ? html`
            <div class="card" style="border: 2px solid var(--primary); margin-bottom: 14px;">
              <div class="card-title">Setup Area: Campaign Numbers & Financial Calculations</div>
              <form onSubmit=${handleSaveConfig}>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <div class="form-group">
                    <label class="form-label">Total Stock (Units)</label>
                    <input
                      type="number"
                      class="form-input"
                      value=${totalStockInput}
                      onInput=${(e) => setTotalStockInput(e.target.value)}
                      required
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Price per Unit (₹)</label>
                    <input
                      type="number"
                      class="form-input"
                      value=${priceInput}
                      onInput=${(e) => setPriceInput(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <div class="form-group">
                    <label class="form-label">Initial Investment (₹)</label>
                    <input
                      type="number"
                      class="form-input"
                      value=${investmentInput}
                      onInput=${(e) => setInvestmentInput(e.target.value)}
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Printing Cost (₹)</label>
                    <input
                      type="number"
                      class="form-input"
                      value=${printingInput}
                      onInput=${(e) => setPrintingInput(e.target.value)}
                    />
                  </div>
                </div>
                <button type="submit" class="btn btn-primary btn-full" disabled=${savingConfig}>
                  ${savingConfig ? 'Saving...' : 'Save & Recalculate ✓'}
                </button>
              </form>
            </div>
          ` : ''}

          <!-- Stock Metrics Grid -->
          <div class="stats-grid" style="margin-bottom: 14px;">
            <div class="stat-card" style="border-top: 3px solid #059669;">
              <div class="stat-value" style="color: #059669; font-weight: 800;">${formatNumber(s.unallocatedCampaignStock || 0)}</div>
              <div class="stat-label" style="font-weight: 600;">Central Warehouse Stock</div>
            </div>
            <div class="stat-card" style="border-top: 3px solid var(--primary);">
              <div class="stat-value" style="color: var(--primary);">${formatNumber(s.totalAllocatedToTeams || 0)}</div>
              <div class="stat-label">Allocated to Teams</div>
            </div>
            <div class="stat-card" style="border-top: 3px solid #2563eb;">
              <div class="stat-value" style="color: #2563eb;">${formatNumber(s.totalAllocatedToMembers || 0)}</div>
              <div class="stat-label">Issued to Members</div>
            </div>
            <div class="stat-card" style="border-top: 3px solid #d97706;">
              <div class="stat-value" style="color: #d97706;">${formatNumber(s.totalDistributed || 0)}</div>
              <div class="stat-label">Distributed to Public</div>
            </div>
          </div>

          <!-- Super Admin Allocate Stock to Team Form -->
          ${isSuperAdmin ? html`
            <div class="card" style="border-top: 4px solid var(--primary); margin-bottom: 14px;">
              <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Allocate Stock to a Team</span>
                <span class="badge badge-success" style="font-size: 12px;">
                  Available Central Stock: <b>${formatNumber(s.unallocatedCampaignStock || 0)}</b>
                </span>
              </div>
              <form onSubmit=${handleAllocateTeam}>
                <div class="form-group">
                  <label class="form-label">Select Target Team</label>
                  <select
                    class="form-input"
                    value=${selectedTeamId}
                    onChange=${(e) => setSelectedTeamId(e.target.value)}
                    required
                  >
                    <option value="">Choose team...</option>
                    ${teams.map((t) => html`
                      <option key=${t._id} value=${t._id}>
                        ${t.name} (Received so far: ${t.allocatedStock || 0}, In Team Stock: ${t.remainingTeamStock || 0})
                      </option>
                    `)}
                  </select>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <div class="form-group">
                    <label class="form-label">Quantity to Allocate</label>
                    <input
                      type="number"
                      min="1"
                      max="99999"
                      class="form-input"
                      placeholder="e.g. 500"
                      value=${teamAllocQty}
                      onInput=${(e) => setTeamAllocQty(e.target.value)}
                      required
                      style="font-size: 18px; font-weight: 700; color: var(--primary);"
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Notes (Optional)</label>
                    <input
                      type="text"
                      class="form-input"
                      placeholder="e.g. North zone kickoff stock"
                      value=${teamAllocNotes}
                      onInput=${(e) => setTeamAllocNotes(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  class="btn btn-primary btn-full"
                  disabled=${submittingTeam || !selectedTeamId}
                >
                  ${submittingTeam
                    ? 'Saving Allocation...'
                    : 'Allocate Stock to Team ✓'}
                </button>
              </form>
            </div>
          ` : ''}

          <!-- Teams Stock Breakdown Table -->
          <div class="card">
            <div class="card-title">Teams Physical Stock Accounting</div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th class="text-right">Received from Central</th>
                    <th class="text-right">Issued to Members</th>
                    <th class="text-right">Remaining Team Stock</th>
                    <th class="text-right">Distributed</th>
                    <th class="text-right">With Members</th>
                  </tr>
                </thead>
                <tbody>
                  ${teams.map((t) => {
                    const received = t.allocatedStock || 0;
                    const issued = t.issuedToMembers || 0;
                    const teamRemaining = t.remainingTeamStock !== undefined ? t.remainingTeamStock : Math.max(0, received - issued);
                    const distributed = t.totalDistributed || 0;
                    const memberRemaining = Math.max(0, issued - distributed);

                    return html`
                      <tr key=${t._id}>
                        <td><b>${t.name}</b></td>
                        <td class="text-right" style="font-weight: 700;">${formatNumber(received)}</td>
                        <td class="text-right">${formatNumber(issued)}</td>
                        <td class="text-right" style="color: #059669; font-weight: 700;">
                          ${formatNumber(teamRemaining)}
                        </td>
                        <td class="text-right" style="color: var(--primary); font-weight: 600;">
                          ${formatNumber(distributed)}
                        </td>
                        <td class="text-right" style="color: #d97706;">
                          ${formatNumber(memberRemaining)}
                        </td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        `}
      ` : ''}
    </div>
  `;
}
