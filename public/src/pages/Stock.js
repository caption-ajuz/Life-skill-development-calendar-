import api from '../services/api.js';
import { currentUser } from '../store/auth.js';
import { formatNumber, formatCurrency } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Stock() {
  const user = currentUser.value;
  const isSuperAdmin = user && user.role === 'super_admin';
  const isUsthad = user && user.role === 'usthad';
  const isLeader = user && user.role === 'team_leader';

  const [summary, setSummary] = useState(null);
  const [config, setConfig] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'reconciliation'

  // Allocation to team
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamAllocQty, setTeamAllocQty] = useState('');
  const [submittingTeam, setSubmittingTeam] = useState(false);

  // Campaign config edit
  const [editConfig, setEditConfig] = useState(false);
  const [totalStockInput, setTotalStockInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [investmentInput, setInvestmentInput] = useState('');
  const [printingInput, setPrintingInput] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  const loadStockData = async () => {
    try {
      const [sumRes, cfgRes, teamsRes, reconRes] = await Promise.all([
        api.get('/api/stock/summary'),
        api.get('/api/stock/campaign'),
        api.get('/api/teams'),
        (isSuperAdmin || isUsthad) ? api.get('/api/stock/reconciliation') : Promise.resolve(null)
      ]);

      if (sumRes && sumRes.success) setSummary(sumRes.data);
      if (cfgRes && cfgRes.success) {
        setConfig(cfgRes.data);
        setTotalStockInput(cfgRes.data.totalStock || 0);
        setPriceInput(cfgRes.data.calendarPrice || 100);
        setInvestmentInput(cfgRes.data.initialInvestment || 0);
        setPrintingInput(cfgRes.data.printingCost || 0);
      }
      if (teamsRes && teamsRes.success) setTeams(teamsRes.data);
      if (reconRes && reconRes.success) setReconciliation(reconRes.data);
    } catch (err) {
      console.warn('Failed to load stock data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStockData();
  }, []);

  const handleAllocateTeam = async (e) => {
    e.preventDefault();
    const qty = parseInt(teamAllocQty, 10);
    if (!selectedTeamId || isNaN(qty) || qty < 0) {
      if (window.showToast) window.showToast('Please select a team and enter a valid quantity.', 'error');
      return;
    }

    setSubmittingTeam(true);
    try {
      await api.post('/api/stock/allocate-team', {
        teamId: selectedTeamId,
        quantity: qty
      });

      if (window.showToast) window.showToast(`Stock allocated to team successfully! ✓`, 'success');
      setTeamAllocQty('');
      loadStockData();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Allocation failed.', 'error');
    } finally {
      setSubmittingTeam(false);
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

  return html`
    <div class="page">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div>
          <h2 style="font-size: 19px; font-weight: 700;">Stock & Inventory</h2>
          <p style="font-size: 12px; color: var(--text-secondary);">Campaign stock, allocations & reconciliation</p>
        </div>
      </div>

      <!-- Tab Switcher for Super Admin / Usthad -->
      ${(isSuperAdmin || isUsthad) ? html`
        <div style="display: flex; gap: 8px; margin-bottom: 12px; background: #e2e8f0; padding: 4px; border-radius: 10px;">
          <button
            class="btn btn-sm ${activeTab === 'overview' ? 'btn-primary' : 'btn-outline'}"
            style="flex: 1; border: none; font-size: 12px;"
            onClick=${() => setActiveTab('overview')}
          >
            📦 Stock Overview
          </button>
          <button
            class="btn btn-sm ${activeTab === 'reconciliation' ? 'btn-primary' : 'btn-outline'}"
            style="flex: 1; border: none; font-size: 12px;"
            onClick=${() => setActiveTab('reconciliation')}
          >
            ⚖️ PRD Stock Reconciliation
          </button>
        </div>
      ` : ''}

      ${activeTab === 'reconciliation' && (isSuperAdmin || isUsthad) ? html`
        <!-- Stock Reconciliation View -->
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

        <!-- Team by Team Reconciliation Table -->
        <div class="card">
          <div class="card-title">Team-Level Reconciliation Breakdown</div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th class="text-right">Allocated</th>
                  <th class="text-right">With Members</th>
                  <th class="text-right">Distributed</th>
                  <th class="text-right">Audit</th>
                </tr>
              </thead>
              <tbody>
                ${(r.teams || []).map((t) => html`
                  <tr key=${t.teamId}>
                    <td><b>${t.teamName}</b></td>
                    <td class="text-right">${formatNumber(t.allocatedToTeam || 0)}</td>
                    <td class="text-right">${formatNumber(t.remainingWithMembers || 0)}</td>
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
      ` : html`
        <!-- Standard Overview Mode -->

        <!-- Campaign Stock Overview Card -->
        <div class="card" style="background: linear-gradient(135deg, #0891b2, #1d4ed8); color: white; border: none;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-size: 13px; opacity: 0.9;">Total Campaign Stock</div>
              <div style="font-size: 28px; font-weight: 700;">${formatNumber(s.totalCampaignStock || 0)}</div>
              <div style="font-size: 12px; opacity: 0.9; margin-top: 2px;">
                Calendar Price: <b>${formatCurrency(s.calendarPrice || 100)}</b> • Content Distributed: <b>${formatNumber(s.totalDistributed || 0)}</b>
              </div>
            </div>
            ${isSuperAdmin
              ? html`
                  <button
                    class="btn btn-sm"
                    style="background: rgba(255,255,255,0.25); color: white; border: none; font-weight: 600;"
                    onClick=${() => setEditConfig(!editConfig)}
                  >
                    ${editConfig ? 'Cancel' : '⚙️ Edit Numbers'}
                  </button>
                `
              : ''}
          </div>
        </div>

        <!-- Edit Stock & Calculations Config Form -->
        ${editConfig
          ? html`
              <div class="card" style="border: 2px solid var(--primary);">
                <div class="card-title">Setup Area: Campaign Numbers & Financial Calculations</div>
                <form onSubmit=${handleSaveConfig}>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="form-group">
                      <label class="form-label">Total Stock (Units)</label>
                      <input
                        type="tel"
                        class="form-input"
                        value=${totalStockInput}
                        onInput=${(e) => setTotalStockInput(e.target.value)}
                        required
                      />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Price per Unit (₹)</label>
                      <input
                        type="tel"
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
                        type="tel"
                        class="form-input"
                        value=${investmentInput}
                        onInput=${(e) => setInvestmentInput(e.target.value)}
                      />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Printing Cost (₹)</label>
                      <input
                        type="tel"
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
            `
          : ''}

        <!-- Stock Metrics Grid -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value" style="color: var(--primary);">${formatNumber(s.totalAllocatedToTeams || 0)}</div>
            <div class="stat-label">Allocated to Teams</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #059669;">${formatNumber(s.unallocatedCampaignStock || 0)}</div>
            <div class="stat-label">Stock in Central Store</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #2563eb;">${formatNumber(s.totalAllocatedToMembers || 0)}</div>
            <div class="stat-label">Allocated to Members</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #d97706;">${formatNumber(s.remainingWithMembers || 0)}</div>
            <div class="stat-label">Remaining with Members</div>
          </div>
        </div>

        <!-- Super Admin Allocate Stock to Team -->
        ${isSuperAdmin
          ? html`
              <div class="card">
                <div class="card-title">Allocate Stock to a Team</div>
                <form onSubmit=${handleAllocateTeam}>
                  <div class="form-group">
                    <label class="form-label">Select Team</label>
                    <select
                      class="form-input"
                      value=${selectedTeamId}
                      onChange=${(e) => setSelectedTeamId(e.target.value)}
                      required
                    >
                      <option value="">Choose team...</option>
                      ${teams.map((t) => html`<option key=${t._id} value=${t._id}>${t.name} (Currently: ${t.allocatedStock || 0})</option>`)}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Quantity to Allocate</label>
                    <input
                      type="tel"
                      pattern="[0-9]*"
                      class="form-input"
                      placeholder="e.g. 500"
                      value=${teamAllocQty}
                      onInput=${(e) => setTeamAllocQty(e.target.value)}
                      required
                      style="font-size: 20px; font-weight: 700; color: var(--primary);"
                    />
                    <div class="form-hint">
                      Available in central store: <b>${formatNumber(s.unallocatedCampaignStock || 0)}</b>
                    </div>
                  </div>
                  <button type="submit" class="btn btn-primary btn-full" disabled=${submittingTeam}>
                    ${submittingTeam ? 'Allocating...' : 'Allocate to Team ✓'}
                  </button>
                </form>
              </div>
            `
          : ''}

        <!-- Team Allocations Breakdown Table -->
        <div class="card">
          <div class="card-title">Team Stock Breakdown</div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th class="text-right">Allocated</th>
                  <th class="text-right">Distributed</th>
                  <th class="text-right">Left</th>
                </tr>
              </thead>
              <tbody>
                ${teams.map(
                  (t) => html`
                    <tr key=${t._id}>
                      <td><b>${t.name}</b></td>
                      <td class="text-right">${formatNumber(t.allocatedStock || 0)}</td>
                      <td class="text-right" style="color: var(--primary); font-weight: 600;">${formatNumber(t.totalDistributed || 0)}</td>
                      <td class="text-right" style="color: #059669;">${formatNumber(Math.max(0, (t.allocatedStock || 0) - (t.totalDistributed || 0)))}</td>
                    </tr>
                  `
                )}
              </tbody>
            </table>
          </div>
        </div>
      `}
    </div>
  `;
}
