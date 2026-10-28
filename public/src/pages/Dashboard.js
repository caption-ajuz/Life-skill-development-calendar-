import api from '../services/api.js';
import { currentUser } from '../store/auth.js';
import { formatCurrency, formatNumber, formatDate } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Dashboard() {
  const user = currentUser.value;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [corrections, setCorrections] = useState([]);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [cfgStock, setCfgStock] = useState('');
  const [cfgPrice, setCfgPrice] = useState('');
  const [cfgInvest, setCfgInvest] = useState('');
  const [cfgPrint, setCfgPrint] = useState('');
  const [savingCfg, setSavingCfg] = useState(false);

  const loadDashboard = async () => {
    if (!user) return;
    try {
      if (['super_admin', 'usthad'].includes(user.role)) {
        const [dashResult, corrResult] = await Promise.allSettled([
          api.get('/api/dashboard/admin'),
          api.get('/api/corrections?status=pending')
        ]);

        if (dashResult.status === 'fulfilled' && dashResult.value && dashResult.value.success) {
          const dashData = dashResult.value.data;
          setData(dashData);
          setCfgStock(dashData.totalStock || 5000);
          setCfgPrice(dashData.calendarPrice || 100);
          setCfgInvest(dashData.initialInvestment || 20000);
          setCfgPrint(dashData.printingCost || 50000);
        } else if (dashResult.status === 'rejected') {
          console.warn('Admin dashboard fetch rejected:', dashResult.reason);
        }

        if (corrResult.status === 'fulfilled' && corrResult.value && corrResult.value.success) {
          setCorrections((corrResult.value.data && corrResult.value.data.corrections) || []);
        }
      } else if (user.role === 'team_leader') {
        const teamId = user.teamId ? (user.teamId._id || user.teamId) : null;
        if (teamId) {
          const res = await api.get(`/api/dashboard/team/${teamId}`);
          if (res && res.success) setData(res.data);
        }
      } else {
        // team_member
        const res = await api.get(`/api/dashboard/member/${user._id}`);
        if (res && res.success) setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      if (window.showToast) window.showToast('Could not refresh dashboard. Displaying offline view.', 'warning');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [user]);

  const handleApproveCorrection = async (id) => {
    try {
      await api.put(`/api/corrections/${id}/approve`);
      if (window.showToast) window.showToast('Correction approved and applied to database! ✓', 'success');
      loadDashboard();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Approval failed.', 'error');
    }
  };

  const handleRejectCorrection = async (id) => {
    const reason = prompt('Optional rejection note:');
    try {
      await api.put(`/api/corrections/${id}/reject`, { rejectionReason: reason || '' });
      if (window.showToast) window.showToast('Correction rejected.', 'info');
      loadDashboard();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Rejection failed.', 'error');
    }
  };

  const handleApproveCollection = async (id) => {
    try {
      await api.put(`/api/collections/${id}/approve`);
      if (window.showToast) window.showToast('Collection approved! ✓', 'success');
      loadDashboard();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Approval failed.', 'error');
    }
  };

  const handleRejectCollection = async (id) => {
    const reason = prompt('Reason for collection rejection:');
    if (!reason || !reason.trim()) return;
    try {
      await api.put(`/api/collections/${id}/reject`, { reason: reason.trim() });
      if (window.showToast) window.showToast('Collection rejected.', 'info');
      loadDashboard();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Rejection failed.', 'error');
    }
  };

  const handleApproveDistribution = async (id) => {
    try {
      await api.put(`/api/distributions/${id}/approve`);
      if (window.showToast) window.showToast('Distribution approved! ✓', 'success');
      loadDashboard();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Approval failed.', 'error');
    }
  };

  const handleRejectDistribution = async (id) => {
    const reason = prompt('Reason for distribution rejection:');
    if (!reason || !reason.trim()) return;
    try {
      await api.put(`/api/distributions/${id}/reject`, { reason: reason.trim() });
      if (window.showToast) window.showToast('Distribution rejected.', 'info');
      loadDashboard();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Rejection failed.', 'error');
    }
  };

  const handleSaveCampaignConfig = async (e) => {
    e.preventDefault();
    setSavingCfg(true);
    try {
      await api.put('/api/stock/campaign', {
        totalStock: parseInt(cfgStock, 10),
        calendarPrice: parseFloat(cfgPrice),
        initialInvestment: parseFloat(cfgInvest),
        printingCost: parseFloat(cfgPrint)
      });
      if (window.showToast) window.showToast('Campaign numbers & calculations updated! ✓', 'success');
      setShowConfigModal(false);
      loadDashboard();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to update numbers.', 'error');
    } finally {
      setSavingCfg(false);
    }
  };

  if (loading) {
    return html`
      <div class="page">
        <div style="height: 120px; margin-bottom: 16px;" class="skeleton"></div>
        <div class="stats-grid">
          <div style="height: 80px;" class="skeleton"></div>
          <div style="height: 80px;" class="skeleton"></div>
          <div style="height: 80px;" class="skeleton"></div>
          <div style="height: 80px;" class="skeleton"></div>
        </div>
      </div>
    `;
  }

  // Super Admin & Usthad Dashboard View
  if (['super_admin', 'usthad'].includes(user.role)) {
    const d = data || {};
    const totalContent = d.totalStock || 5000;
    const distributedContent = d.totalDistributed || 0;
    const distributedPercent = totalContent > 0 ? ((distributedContent / totalContent) * 100).toFixed(1) : '0';
    const remainingStock = Math.max(0, totalContent - distributedContent);

    return html`
      <div class="page">
        <!-- Welcome Card -->
        <div class="card" style="background: linear-gradient(135deg, #0891b2, #1d4ed8); color: white; border: none;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-size: 13px; opacity: 0.9;">Campaign Overview</div>
              <div style="font-size: 18px; font-weight: 700; margin-top: 2px;">Markazul Hidayathil Islamiyya</div>
              <div style="font-size: 12px; opacity: 0.85; margin-top: 4px;">Logged in as: <b>${user.fullName}</b> (${user.role === 'super_admin' ? 'Super Admin' : 'Supervisor Usthad'})</div>
            </div>
            ${user.role === 'super_admin' ? html`
              <button
                class="btn btn-sm"
                style="background: rgba(255,255,255,0.25); color: white; border: none; font-size: 11px; font-weight: 600;"
                onClick=${() => setShowConfigModal(true)}
              >
                ⚙️ Setup Numbers
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Admin Setup & Initial Information Card -->
        <div class="card" style="border-left: 4px solid #0891b2;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div class="card-title" style="margin-bottom: 0;">Initial Information & Content Distributed</div>
            <span class="badge badge-info" style="font-weight: 700;">${distributedPercent}% Complete</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
            <div style="padding: 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; color: var(--text-secondary);">Content Distributed</div>
              <div style="font-size: 20px; font-weight: 700; color: #0891b2;">${formatNumber(distributedContent)}</div>
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">out of ${formatNumber(totalContent)} total</div>
            </div>
            <div style="padding: 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; color: var(--text-secondary);">Remaining Stock</div>
              <div style="font-size: 20px; font-weight: 700; color: #d97706;">${formatNumber(remainingStock)}</div>
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">unit price: ${formatCurrency(d.calendarPrice || 100)}</div>
            </div>
          </div>
          <div style="height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
            <div style="height: 100%; width: ${Math.min(100, distributedPercent)}%; background: linear-gradient(90deg, #0891b2, #10b981);"></div>
          </div>
        </div>

        <!-- Setup Numbers Modal -->
        ${showConfigModal ? html`
          <div class="modal-overlay" onClick=${() => setShowConfigModal(false)}>
            <div class="modal" onClick=${(e) => e.stopPropagation()}>
              <div class="modal-header">
                <div class="modal-title">Admin Setup Area: Edit Numbers & Calculations</div>
                <button onClick=${() => setShowConfigModal(false)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
              </div>
              <form onSubmit=${handleSaveCampaignConfig}>
                <div class="form-group">
                  <label class="form-label">Total Campaign Stock (Calendars)</label>
                  <input type="tel" class="form-input" value=${cfgStock} onInput=${(e) => setCfgStock(e.target.value)} required />
                </div>
                <div class="form-group">
                  <label class="form-label">Calendar Selling Price (₹)</label>
                  <input type="tel" class="form-input" value=${cfgPrice} onInput=${(e) => setCfgPrice(e.target.value)} required />
                </div>
                <div class="form-group">
                  <label class="form-label">Initial Investment Amount (₹)</label>
                  <input type="tel" class="form-input" value=${cfgInvest} onInput=${(e) => setCfgInvest(e.target.value)} />
                </div>
                <div class="form-group">
                  <label class="form-label">Total Printing Cost (₹)</label>
                  <input type="tel" class="form-input" value=${cfgPrint} onInput=${(e) => setCfgPrint(e.target.value)} />
                </div>
                <div style="display: flex; gap: 8px; margin-top: 14px;">
                  <button type="button" class="btn btn-secondary" style="flex: 1;" onClick=${() => setShowConfigModal(false)}>Cancel</button>
                  <button type="submit" class="btn btn-primary" style="flex: 2;" disabled=${savingCfg}>
                    ${savingCfg ? 'Saving...' : 'Save & Recalculate ✓'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ` : ''}

        <!-- PRD Correction Request & Review Queue -->
        ${corrections.length > 0 ? html`
          <div class="card" style="border-left: 4px solid #f59e0b; background: #fffbeb;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #b45309; font-size: 14px;">
                ⚠️ Pending Correction Queue (${corrections.length})
              </div>
              <span class="badge badge-warning">Requires Authorization</span>
            </div>
            <p style="font-size: 12px; color: #92400e; margin-bottom: 10px;">
              Review correction requests submitted by leaders and members for authorization.
            </p>
            ${corrections.map((c) => html`
              <div style="background: white; border: 1px solid #fde68a; border-radius: 8px; padding: 10px; margin-bottom: 8px;" key=${c._id}>
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                  <b>${c.requestedBy ? c.requestedBy.fullName : 'Participant'} (@${c.requestedBy ? c.requestedBy.username : 'user'})</b>
                  <span style="text-transform: capitalize; color: #0891b2; font-weight: 600;">${c.entityType}</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">
                  Reason: "${c.reason}"
                </div>
                <div style="display: flex; gap: 8px; font-size: 11px; margin-bottom: 8px; font-family: monospace;">
                  <span style="background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px;">
                    Original: ${JSON.stringify(c.oldValues)}
                  </span>
                  <span style="background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px;">
                    New: ${JSON.stringify(c.newValues)}
                  </span>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button
                    class="btn btn-primary btn-sm"
                    style="flex: 1; font-size: 11px; padding: 4px 8px; background: #059669; border-color: #059669;"
                    onClick=${() => handleApproveCorrection(c._id)}
                  >
                    ✓ Approve & Apply
                  </button>
                  <button
                    class="btn btn-outline btn-sm"
                    style="flex: 1; font-size: 11px; padding: 4px 8px; color: #dc2626; border-color: #fca5a5;"
                    onClick=${() => handleRejectCorrection(c._id)}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            `)}
          </div>
        ` : ''}

        <!-- Campaign Stats Grid -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${formatNumber(d.totalDistributed || 0)}</div>
            <div class="stat-label">Distributed Calendars</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #059669;">${formatCurrency(d.totalCollected || 0)}</div>
            <div class="stat-label">Total Collections</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #2563eb;">${formatCurrency(d.confirmedTransfers || 0)}</div>
            <div class="stat-label">Confirmed In Bank</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #d97706;">${formatCurrency(d.pendingTransfers || 0)}</div>
            <div class="stat-label">Transfers Pending</div>
          </div>
        </div>

        <!-- Stock & Teams Stats -->
        <div class="card">
          <div class="card-title">Stock Summary</div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 14px;">
            <span>Total Stock Registered:</span>
            <b>${formatNumber(d.totalStock || 0)}</b>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 14px;">
            <span>Allocated to Teams:</span>
            <b>${formatNumber(d.allocatedToTeams || 0)}</b>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
            <span>Distributed by Teams:</span>
            <b style="color: var(--primary);">${formatNumber(d.totalDistributed || 0)}</b>
          </div>
        </div>

        <!-- Financial Summary (Clear non-distorted calculation) -->
        <div class="card">
          <div class="card-title">Financial Summary & Live Calculations</div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
            <span>Total Collected Income:</span>
            <b style="color: #059669;">${formatCurrency(d.totalCollected || 0)}</b>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
            <span>Initial Investment:</span>
            <span>${formatCurrency(d.initialInvestment || 0)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
            <span>Printing Costs:</span>
            <span>${formatCurrency(d.printingCost || 0)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
            <span>Other Operating Expenses:</span>
            <span>${formatCurrency(d.otherExpenses || 0)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px 0; border-top: 2px solid var(--border); margin-top: 4px; font-size: 15px; font-weight: 700;">
            <span>Net Financial Balance:</span>
            <span style="color: ${(d.netProfitOrLoss || 0) >= 0 ? '#059669' : '#dc2626'};">${formatCurrency(d.netProfitOrLoss || 0)}</span>
          </div>
        </div>

        <!-- Quick Action Buttons -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px;">
          <a href="#/teams" class="btn btn-secondary text-center" style="font-size: 13px;">Manage Teams (${d.totalTeams || 0})</a>
          <a href="#/stock" class="btn btn-secondary text-center" style="font-size: 13px;">Stock & Reconciliation</a>
          <a href="#/transfers" class="btn btn-secondary text-center" style="font-size: 13px;">
            Verify Transfers ${d.pendingTransfersCount > 0 ? html`<span class="badge badge-error" style="margin-left: 4px;">${d.pendingTransfersCount}</span>` : ''}
          </a>
          <a href="#/reports" class="btn btn-primary text-center" style="font-size: 13px;">WhatsApp & PDF Reports</a>
        </div>

        <!-- Team Rankings -->
        ${d.teamRankings && d.teamRankings.length > 0 ? html`
          <div class="card">
            <div class="card-title">Top Performing Teams</div>
            ${d.teamRankings.map((t, idx) => html`
              <div class="list-item" key=${t._id}>
                <div style="width: 28px; height: 28px; border-radius: 50%; background: ${idx === 0 ? '#fef08a' : idx === 1 ? '#e2e8f0' : '#ffedd5'}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: #1e293b;">
                  ${idx + 1}
                </div>
                <div class="list-content">
                  <div class="list-title">${t.name}</div>
                  <div class="list-subtitle">${formatNumber(t.distributed)} calendars distributed</div>
                </div>
                <div style="font-weight: 600; color: #059669; font-size: 14px;">
                  ${formatCurrency(t.collected)}
                </div>
              </div>
            `)}
          </div>
        ` : ''}
      </div>
    `;
  }

  // Team Leader Dashboard View
  if (user.role === 'team_leader') {
    const d = data || {};
    const pendingCols = (d.pendingApprovals && d.pendingApprovals.collections) || [];
    const pendingDists = (d.pendingApprovals && d.pendingApprovals.distributions) || [];
    const totalPending = (d.pendingApprovals && d.pendingApprovals.total) || (pendingCols.length + pendingDists.length);

    return html`
      <div class="page">
        <!-- Team Header Card -->
        <div class="card" style="background: linear-gradient(135deg, #0891b2, #1d4ed8); color: white; border: none;">
          <div style="font-size: 13px; opacity: 0.9;">Team Leader Dashboard</div>
          <div style="font-size: 19px; font-weight: 700; margin-top: 2px;">${d.team ? d.team.name : 'My Team'}</div>
          <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">Leader: ${user.fullName}</div>
        </div>

        
        <!-- Team Leader Direct Action Buttons (Collect Money & Distribute Calendars) -->
        <div class="card" style="margin-bottom: 12px; padding: 12px; background: white; border-top: 3px solid #0891b2;">
          <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 8px;">
            ⚡ Quick Entry & WhatsApp Sharing
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
            <a
              href="#/collections?action=new"
              class="btn btn-primary"
              style="background: #059669; border-color: #059669; font-size: 13px; padding: 10px 8px; display: flex; align-items: center; justify-content: center; gap: 6px; text-decoration: none; font-weight: 700;"
            >
              <span>💰</span>
              <span>+ Collect Money</span>
            </a>
            <a
              href="#/distributions?action=new"
              class="btn btn-primary"
              style="background: #0284c7; border-color: #0284c7; font-size: 13px; padding: 10px 8px; display: flex; align-items: center; justify-content: center; gap: 6px; text-decoration: none; font-weight: 700;"
            >
              <span>📦</span>
              <span>+ Distribute</span>
            </a>
          </div>
          <button
            type="button"
            class="btn btn-outline btn-full"
            style="color: #15803d; border-color: #86efac; background: #f0fdf4; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px;"
            onClick=${() => handleShareTeamWhatsApp(d)}
          >
            <span>📲</span>
            <span>Share Team Member Cash to WhatsApp</span>
          </button>
        </div>

        <!-- Pending Member Approvals Queue (CRITICAL REVIEW ACTION) -->
        ${totalPending > 0 ? html`
          <div class="card" style="border-left: 4px solid #f59e0b; background: #fffbeb;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #b45309; font-size: 14px;">
                ⚠️ Pending Member Entries for Review (${totalPending})
              </div>
              <span class="badge badge-warning" style="font-weight: 700;">Action Required</span>
            </div>
            <p style="font-size: 12px; color: #92400e; margin-bottom: 10px;">
              Your members have submitted entries requiring your approval. Approved entries instantly reflect on official totals and target progress.
            </p>

            ${pendingCols.length > 0 ? html`
              <div style="font-size: 12px; font-weight: 700; color: #047857; margin-bottom: 6px;">
                💰 Pending Collections (${pendingCols.length})
              </div>
              ${pendingCols.map((col) => html`
                <div style="background: white; border: 1px solid #fde68a; border-radius: 8px; padding: 10px; margin-bottom: 8px;" key=${col._id}>
                  <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 3px;">
                    <b>${col.memberId ? col.memberId.fullName : 'Member'}</b>
                    <b style="color: #059669; font-size: 14px;">${formatCurrency(col.amount)}</b>
                  </div>
                  <div style="font-size: 11.5px; color: var(--text-secondary); margin-bottom: 6px;">
                    Area: ${col.areaId ? col.areaId.name : 'General'} • Date: ${formatDate(col.date)}
                    ${col.notes ? html` • <i>"${col.notes}"</i>` : ''}
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <button
                      class="btn btn-primary btn-sm"
                      style="flex: 1; font-size: 11.5px; padding: 5px 8px; background: #059669; border-color: #059669;"
                      onClick=${() => handleApproveCollection(col._id)}
                    >
                      ✓ Approve
                    </button>
                    <button
                      class="btn btn-outline btn-sm"
                      style="flex: 1; font-size: 11.5px; padding: 5px 8px; color: #dc2626; border-color: #fca5a5;"
                      onClick=${() => handleRejectCollection(col._id)}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              `)}
            ` : ''}

            ${pendingDists.length > 0 ? html`
              <div style="font-size: 12px; font-weight: 700; color: #0891b2; margin-top: 10px; margin-bottom: 6px;">
                📦 Pending Distributions (${pendingDists.length})
              </div>
              ${pendingDists.map((dist) => html`
                <div style="background: white; border: 1px solid #fde68a; border-radius: 8px; padding: 10px; margin-bottom: 8px;" key=${dist._id}>
                  <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 3px;">
                    <b>${dist.memberId ? dist.memberId.fullName : 'Member'}</b>
                    <span class="badge badge-info" style="font-weight: 700; font-size: 12px;">+${dist.quantity} Calendars</span>
                  </div>
                  <div style="font-size: 11.5px; color: var(--text-secondary); margin-bottom: 6px;">
                    Area: ${dist.areaId ? dist.areaId.name : 'General'} • Date: ${formatDate(dist.date)}
                    ${dist.notes ? html` • <i>"${dist.notes}"</i>` : ''}
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <button
                      class="btn btn-primary btn-sm"
                      style="flex: 1; font-size: 11.5px; padding: 5px 8px; background: #059669; border-color: #059669;"
                      onClick=${() => handleApproveDistribution(dist._id)}
                    >
                      ✓ Approve
                    </button>
                    <button
                      class="btn btn-outline btn-sm"
                      style="flex: 1; font-size: 11.5px; padding: 5px 8px; color: #dc2626; border-color: #fca5a5;"
                      onClick=${() => handleRejectDistribution(dist._id)}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              `)}
            ` : ''}
          </div>
        ` : ''}

        <!-- Leader Personal Progress Card (Clearly distinguished from team totals) -->
        ${d.leaderPersonalProgress ? html`
          <div class="card" style="border-left: 4px solid #10b981; background: #f0fdf4;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <div style="font-weight: 700; color: #166534; font-size: 14px;">
                👤 Team Leader Personal Collection Progress
              </div>
              <span class="badge badge-success" style="font-size: 11px; font-weight: 700;">
                ${d.leaderPersonalProgress.progressPercent}% Achieved
              </span>
            </div>
            <div style="font-size: 11.5px; color: #15803d; margin-bottom: 8px;">
              Personal target and approved collections for ${d.leaderPersonalProgress.fullName} (managed distinctly from team summary).
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px; text-align: center;">
              <div style="background: white; padding: 8px; border-radius: 6px; border: 1px solid #bbf7d0;">
                <div style="font-size: 10.5px; color: var(--text-secondary);">Personal Target</div>
                <div style="font-weight: 700; color: #1e293b; font-size: 13.5px;">${formatCurrency(d.leaderPersonalProgress.target)}</div>
              </div>
              <div style="background: white; padding: 8px; border-radius: 6px; border: 1px solid #bbf7d0;">
                <div style="font-size: 10.5px; color: var(--text-secondary);">Approved Collected</div>
                <div style="font-weight: 700; color: #059669; font-size: 13.5px;">${formatCurrency(d.leaderPersonalProgress.approvedCollected)}</div>
              </div>
              <div style="background: white; padding: 8px; border-radius: 6px; border: 1px solid #bbf7d0;">
                <div style="font-size: 10.5px; color: var(--text-secondary);">Remaining to Goal</div>
                <div style="font-weight: 700; color: #d97706; font-size: 13.5px;">${formatCurrency(d.leaderPersonalProgress.remaining)}</div>
              </div>
            </div>
            <div style="height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
              <div style="height: 100%; width: ${Math.min(100, d.leaderPersonalProgress.progressPercent)}%; background: #10b981;"></div>
            </div>
          </div>
        ` : ''}

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${formatNumber(d.stockAllocatedToTeam || 0)}</div>
            <div class="stat-label">Team Total Stock</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #0891b2;">${formatNumber(d.totalDistributed || 0)}</div>
            <div class="stat-label">Distributed</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #059669;">${formatCurrency(d.totalCollected || 0)}</div>
            <div class="stat-label">Team Collections</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #d97706;">${formatCurrency(d.outstandingCollections || 0)}</div>
            <div class="stat-label">Pending Handover</div>
          </div>
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 16px;">
          <a href="#/stock" class="btn btn-secondary" style="flex: 1; font-size: 13px;">Allocate Stock</a>
          <a href="#/transfers" class="btn btn-secondary" style="flex: 1; font-size: 13px;">Team Transfers</a>
        </div>

        <!-- Team Target Summary Card -->
        ${d.teamTargetSummary ? html`
          <div class="card" style="border-top: 3px solid #0891b2;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div class="card-title" style="margin-bottom: 0;">🎯 Team Collection Target Overview</div>
              <span class="badge badge-info" style="font-weight: 700;">${d.teamTargetSummary.progressPercent}% of Team Target</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px; text-align: center;">
              <div style="background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <div style="font-size: 10.5px; color: var(--text-secondary);">Team Target</div>
                <div style="font-weight: 700; color: #1e293b; font-size: 13.5px;">${formatCurrency(d.teamTargetSummary.totalTarget)}</div>
              </div>
              <div style="background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <div style="font-size: 10.5px; color: var(--text-secondary);">Team Collected</div>
                <div style="font-weight: 700; color: #059669; font-size: 13.5px;">${formatCurrency(d.teamTargetSummary.totalCollected)}</div>
              </div>
              <div style="background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <div style="font-size: 10.5px; color: var(--text-secondary);">Remaining</div>
                <div style="font-weight: 700; color: #d97706; font-size: 13.5px;">${formatCurrency(d.teamTargetSummary.remaining)}</div>
              </div>
            </div>
            <div style="height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
              <div style="height: 100%; width: ${Math.min(100, d.teamTargetSummary.progressPercent)}%; background: linear-gradient(90deg, #0891b2, #10b981);"></div>
            </div>
          </div>
        ` : ''}

        <!-- Member Progress Table -->
        <div class="card">
          <div class="card-title">Member Progress (${d.memberProgress ? d.memberProgress.length : 0})</div>
          ${(d.memberProgress || []).map((m) => {
            const stockPct = m.allocated > 0 ? Math.min(100, Math.round((m.distributed / m.allocated) * 100)) : 0;
            const targetPct = m.targetPercentage || (m.target > 0 ? Math.min(100, Math.round((m.collected / m.target) * 100)) : 0);
            return html`
              <div class="list-item" key=${m._id} style="align-items: flex-start; padding: 10px 0; border-bottom: 1px solid var(--border);">
                <div class="list-avatar" style="margin-top: 2px;">
                  ${m.profilePhoto ? html`<img src="${m.profilePhoto}" alt="" />` : m.fullName.charAt(0)}
                </div>
                <div class="list-content" style="flex: 1;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div class="list-title" style="font-weight: 700;">
                      ${m.fullName}
                      ${m.role === 'team_leader' ? html`<span class="badge badge-info" style="margin-left: 6px; font-size: 10px;">Leader</span>` : ''}
                    </div>
                    <div style="font-weight: 700; font-size: 13.5px; color: #059669;">
                      ${formatCurrency(m.collected || 0)}
                    </div>
                  </div>

                  <!-- Collection Target Progress -->
                  <div style="margin: 4px 0 2px 0;">
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary);">
                      <span>Target: <b>${formatCurrency(m.target || 25000)}</b> (Left: ${formatCurrency(m.remainingToTarget !== undefined ? m.remainingToTarget : Math.max(0, (m.target || 25000) - (m.collected || 0)))})</span>
                      <span style="font-weight: 600; color: ${targetPct >= 100 ? '#059669' : '#0891b2'};">${targetPct}%</span>
                    </div>
                    <div style="height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 2px; overflow: hidden;">
                      <div style="height: 100%; width: ${Math.min(100, targetPct)}%; background: #10b981;"></div>
                    </div>
                  </div>

                  <!-- Stock Allocation Progress -->
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                    Stock: ${m.distributed} / ${m.allocated} calendars (${stockPct}%)
                  </div>
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  // Team Member Dashboard View
  const d = data || {};
  return html`
    <div class="page">
      <!-- Member Profile Header -->
      <div class="card" style="background: linear-gradient(135deg, #0891b2, #1d4ed8); color: white; border: none;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="list-avatar" style="width: 50px; height: 50px; font-size: 20px; background: white; color: var(--primary);">
            ${user.profilePhoto ? html`<img src="${user.profilePhoto}" alt="" />` : user.fullName.charAt(0)}
          </div>
          <div>
            <div style="font-size: 17px; font-weight: 700;">${user.fullName}</div>
            <div style="font-size: 13px; opacity: 0.9;">${d.member ? d.member.team : 'Participant'}</div>
          </div>
        </div>
      </div>

      <!-- Quick Action Buttons for fast mobile entry -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px;">
        <a href="#/distribution" class="btn btn-primary" style="padding: 12px 10px; font-size: 14px;">
          📦 + Distribute
        </a>
        <a href="#/collections" class="btn btn-success" style="padding: 12px 10px; font-size: 14px;">
          💰 + Collect Money
        </a>
      </div>

      <!-- Personal Collection Target Card -->
      <div class="card" style="border-left: 4px solid #10b981; background: #f0fdf4;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <div style="font-weight: 700; color: #166534; font-size: 14px;">
            🎯 My Collection Target Progress
          </div>
          <span class="badge badge-success" style="font-size: 11px; font-weight: 700;">
            ${d.targetPercentage || 0}% Achieved
          </span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px; text-align: center;">
          <div style="background: white; padding: 8px; border-radius: 6px; border: 1px solid #bbf7d0;">
            <div style="font-size: 10.5px; color: var(--text-secondary);">My Target</div>
            <div style="font-weight: 700; color: #1e293b; font-size: 13.5px;">${formatCurrency(d.collectionTarget || 25000)}</div>
          </div>
          <div style="background: white; padding: 8px; border-radius: 6px; border: 1px solid #bbf7d0;">
            <div style="font-size: 10.5px; color: var(--text-secondary);">Approved Collected</div>
            <div style="font-weight: 700; color: #059669; font-size: 13.5px;">${formatCurrency(d.collectedAmount || 0)}</div>
          </div>
          <div style="background: white; padding: 8px; border-radius: 6px; border: 1px solid #bbf7d0;">
            <div style="font-size: 10.5px; color: var(--text-secondary);">Remaining to Goal</div>
            <div style="font-weight: 700; color: #d97706; font-size: 13.5px;">${formatCurrency(d.remainingToTarget || 0)}</div>
          </div>
        </div>
        <div style="height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
          <div style="height: 100%; width: ${Math.min(100, d.targetPercentage || 0)}%; background: #10b981;"></div>
        </div>
      </div>

      <!-- Personal Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${formatNumber(d.allocatedStock || 0)}</div>
          <div class="stat-label">My Stock Allocated</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: var(--primary);">${formatNumber(d.distributedStock || 0)}</div>
          <div class="stat-label">Calendars Given</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #059669;">${formatCurrency(d.collectedAmount || 0)}</div>
          <div class="stat-label">Collected Amount</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #d97706;">${formatCurrency(d.untransferredAmount || 0)}</div>
          <div class="stat-label">In-Hand to Transfer</div>
        </div>
      </div>

      <a href="#/transfers" class="btn btn-secondary btn-full" style="margin-bottom: 16px;">
        🤝 Handover Collected Money (${formatCurrency(d.untransferredAmount || 0)})
      </a>

      <!-- Recent Distributions -->
      ${d.recentDistributions && d.recentDistributions.length > 0 ? html`
        <div class="card">
          <div class="card-title">Recent Distributions</div>
          ${d.recentDistributions.map((dist) => html`
            <div class="list-item" key=${dist._id}>
              <div class="list-content">
                <div class="list-title">${dist.areaId ? dist.areaId.name : 'Unspecified Area'}</div>
                <div class="list-subtitle">${formatDate(dist.date)} • ${dist.notes || 'Routine entry'}</div>
              </div>
              <div class="badge badge-success" style="font-size: 13px; font-weight: 700;">
                +${dist.quantity}
              </div>
            </div>
          `)}
        </div>
      ` : ''}

      <!-- Recent Collections -->
      ${d.recentCollections && d.recentCollections.length > 0 ? html`
        <div class="card">
          <div class="card-title">Recent Collections</div>
          ${d.recentCollections.map((col) => html`
            <div class="list-item" key=${col._id}>
              <div class="list-content">
                <div class="list-title">${col.areaId ? col.areaId.name : 'Area Collection'}</div>
                <div class="list-subtitle">${formatDate(col.date)}</div>
              </div>
              <div style="font-weight: 700; color: #059669;">
                ${formatCurrency(col.amount)}
              </div>
            </div>
          `)}
        </div>
      ` : ''}
    </div>
  `;
}
