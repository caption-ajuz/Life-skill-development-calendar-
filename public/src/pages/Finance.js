import api from '../services/api.js';
import { currentUser } from '../store/auth.js';
import { formatCurrency, formatDate } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Finance() {
  const user = currentUser.value;
  const isSuperOrUsthad = user && ['super_admin', 'usthad'].includes(user.role);
  const isLeader = user && user.role === 'team_leader';
  const isMember = user && user.role === 'team_member';

  const [adminData, setAdminData] = useState(null);
  const [leaderData, setLeaderData] = useState(null);
  const [memberProfile, setMemberProfile] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add Expense form
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseCat, setExpenseCat] = useState('transport');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [submittingExpense, setSubmittingExpense] = useState(false);

  // Add Other Campaign Income form (for field members/leaders)
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [incomeType, setIncomeType] = useState('donation'); // 'calendar_sale' | 'donation' | 'other_income'
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeDesc, setIncomeDesc] = useState('');
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().slice(0, 10));
  const [submittingIncome, setSubmittingIncome] = useState(false);

  const loadFinancialData = async () => {
    setLoading(true);
    try {
      if (isSuperOrUsthad) {
        const [dashRes, expRes] = await Promise.all([
          api.get('/api/dashboard/admin'),
          api.get('/api/expenses')
        ]);
        if (dashRes && dashRes.success) setAdminData(dashRes.data);
        if (expRes && expRes.success) setExpenses(expRes.data.expenses || []);
      } else if (isLeader) {
        const [dashRes, expRes] = await Promise.all([
          api.get('/api/dashboard/leader').catch(() => null),
          api.get('/api/expenses')
        ]);
        if (dashRes && dashRes.success) setLeaderData(dashRes.data);
        if (expRes && expRes.success) setExpenses(expRes.data.expenses || []);
      } else if (isMember) {
        const [profRes, expRes] = await Promise.all([
          api.get(`/api/users/${user._id}/profile`),
          api.get('/api/expenses')
        ]);
        if (profRes && profRes.success) setMemberProfile(profRes.data);
        if (expRes && expRes.success) setExpenses(expRes.data.expenses || []);
      }
    } catch (err) {
      if (window.showToast) window.showToast('Failed to load financial records.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadFinancialData();
    }
  }, [user]);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount);
    if (isNaN(amt) || amt <= 0 || !expenseDesc.trim()) {
      if (window.showToast) window.showToast('Enter a description and a valid amount.', 'error');
      return;
    }

    setSubmittingExpense(true);
    try {
      await api.post('/api/expenses', {
        category: expenseCat,
        description: expenseDesc.trim(),
        amount: amt,
        date: expenseDate
      });
      if (window.showToast) window.showToast('Expense recorded successfully! ✓', 'success');
      setShowAddExpense(false);
      setExpenseDesc('');
      setExpenseAmount('');
      setExpenseDate(new Date().toISOString().slice(0, 10));
      loadFinancialData();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to record expense.', 'error');
    } finally {
      setSubmittingExpense(false);
    }
  };

  const handleAddIncome = async (e) => {
    e.preventDefault();
    const amt = parseFloat(incomeAmount);
    if (isNaN(amt) || amt <= 0) {
      if (window.showToast) window.showToast('Please enter a valid income amount.', 'error');
      return;
    }

    setSubmittingIncome(true);
    try {
      await api.post('/api/collections', {
        amount: amt,
        incomeType: incomeType,
        notes: incomeDesc.trim() || undefined,
        date: incomeDate
      });
      if (window.showToast) window.showToast('Income entry recorded! ✓', 'success');
      setShowAddIncome(false);
      setIncomeAmount('');
      setIncomeDesc('');
      setIncomeDate(new Date().toISOString().slice(0, 10));
      loadFinancialData();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to record income.', 'error');
    } finally {
      setSubmittingIncome(false);
    }
  };

  if (!user) {
    return html`<div class="page"><div class="empty-state"><p>Please sign in to view financial records.</p></div></div>`;
  }

  if (loading) {
    return html`<div class="page"><div style="height: 140px;" class="skeleton"></div></div>`;
  }

  const d = adminData || {};
  const ld = leaderData || {};
  const mp = memberProfile ? memberProfile.metrics : {};

  return html`
    <div class="page">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
        <div>
          <h2 style="font-size: 19px; font-weight: 700; color: var(--text);">
            ${isSuperOrUsthad
              ? 'Campaign Financial Management'
              : isLeader
              ? 'Team Financial Overview'
              : 'My Financial Records'}
          </h2>
          <p style="font-size: 12px; color: var(--text-secondary); margin-top: 1px;">
            ${isSuperOrUsthad
              ? 'Central investments, printing costs, collections & net surplus'
              : isLeader
              ? 'Team collections, member handovers & authorized team expenses'
              : 'Personal calendar collections, other income & handovers'}
          </p>
        </div>

        <div style="display: flex; gap: 6px;">
          <button
            class="btn btn-secondary btn-sm"
            onClick=${() => setShowAddIncome(!showAddIncome)}
          >
            ${showAddIncome ? 'Cancel' : '+ Record Income'}
          </button>
          <button
            class="btn btn-primary btn-sm"
            onClick=${() => setShowAddExpense(!showAddExpense)}
          >
            ${showAddExpense ? 'Cancel' : '+ Add Expense'}
          </button>
        </div>
      </div>

      <!-- Add Expense Form Modal / Inline Card -->
      ${showAddExpense ? html`
        <div class="card" style="border: 1.5px solid var(--primary); margin-bottom: 14px;">
          <div class="card-title">Record Expense Entry</div>
          <form onSubmit=${handleAddExpense}>
            <div class="form-group">
              <label class="form-label">Category</label>
              <select class="form-input" value=${expenseCat} onChange=${(e) => setExpenseCat(e.target.value)}>
                <option value="transport">Transport / Travel</option>
                <option value="food">Food & Refreshments</option>
                <option value="communication">Communication & Mobile</option>
                <option value="stationery">Stationery / Packaging</option>
                <option value="printing">Printing & Materials</option>
                <option value="other">Other Operating Expense</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Description / Purpose *</label>
              <input
                class="form-input"
                type="text"
                maxlength="300"
                placeholder="e.g. Bus fare for Mannarkkad distribution"
                value=${expenseDesc}
                onInput=${(e) => setExpenseDesc(e.target.value)}
                required
              />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div class="form-group">
                <label class="form-label">Amount (₹) *</label>
                <input
                  class="form-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputmode="decimal"
                  placeholder="₹ 0.00"
                  value=${expenseAmount}
                  onInput=${(e) => setExpenseAmount(e.target.value)}
                  required
                />
              </div>
              <div class="form-group">
                <label class="form-label">Date *</label>
                <input
                  class="form-input"
                  type="date"
                  value=${expenseDate}
                  onInput=${(e) => setExpenseDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-full" disabled=${submittingExpense}>
              ${submittingExpense ? 'Saving Expense...' : 'Save Expense'}
            </button>
          </form>
        </div>
      ` : ''}

      <!-- Add Income Form Modal / Inline Card -->
      ${showAddIncome ? html`
        <div class="card" style="border: 1.5px solid #059669; margin-bottom: 14px;">
          <div class="card-title" style="color: #059669;">Record Campaign Income</div>
          <form onSubmit=${handleAddIncome}>
            <div class="form-group">
              <label class="form-label">Income Type</label>
              <select class="form-input" value=${incomeType} onChange=${(e) => setIncomeType(e.target.value)}>
                <option value="donation">Direct Campaign Donation</option>
                <option value="calendar_sale">Calendar Sale Collection</option>
                <option value="other_income">Sponsorship / Other Campaign Income</option>
              </select>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div class="form-group">
                <label class="form-label">Amount (₹) *</label>
                <input
                  class="form-input"
                  type="number"
                  min="1"
                  step="1"
                  inputmode="numeric"
                  placeholder="₹ Amount"
                  value=${incomeAmount}
                  onInput=${(e) => setIncomeAmount(e.target.value)}
                  required
                />
              </div>
              <div class="form-group">
                <label class="form-label">Date *</label>
                <input
                  class="form-input"
                  type="date"
                  value=${incomeDate}
                  onInput=${(e) => setIncomeDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Donor Name / Description</label>
              <input
                class="form-input"
                type="text"
                placeholder="e.g. Well-wisher donation from Alanallur"
                value=${incomeDesc}
                onInput=${(e) => setIncomeDesc(e.target.value)}
              />
            </div>
            <button type="submit" class="btn btn-primary btn-full" style="background: #059669;" disabled=${submittingIncome}>
              ${submittingIncome ? 'Recording Income...' : 'Record Income Entry'}
            </button>
          </form>
        </div>
      ` : ''}

      <!-- ROLE-SPECIFIC FINANCIAL VIEWS -->

      <!-- 1. SUPER ADMIN / USTHAD VIEW -->
      ${isSuperOrUsthad ? html`
        <div>
          <!-- Net Financial Summary Card -->
          <div class="card" style="background: linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%); color: white; border: none; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.25);">
            <div style="font-size: 13px; opacity: 0.9;">Total Campaign Collections</div>
            <div style="font-size: 30px; font-weight: 800; margin-top: 2px;">${formatCurrency(d.totalCollected || 0)}</div>
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2); display: flex; justify-content: space-between; font-size: 13px;">
              <span>Net Surplus / Balance:</span>
              <b style="font-size: 16px; color: ${(d.netProfitOrLoss || 0) >= 0 ? '#86efac' : '#fca5a5'};">
                ${formatCurrency(d.netProfitOrLoss || 0)}
              </b>
            </div>
          </div>

          <!-- Income & Expenditure Breakdown -->
          <div class="card">
            <div class="card-title">Campaign Financial Audit</div>

            <div style="margin-bottom: 12px;">
              <div style="font-size: 12px; font-weight: 700; color: #059669; text-transform: uppercase; margin-bottom: 6px;">
                Income & Field Receipts
              </div>
              <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border);">
                <span>Total Collections Recorded:</span>
                <b style="color: #059669;">${formatCurrency(d.totalCollected || 0)}</b>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border);">
                <span style="color: var(--text-secondary); padding-left: 10px;">• Confirmed in Bank / Usthad:</span>
                <span style="font-weight: 600; color: #059669;">${formatCurrency(d.confirmedTransfers || 0)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
                <span style="color: var(--text-secondary); padding-left: 10px;">• Pending Handover in Field:</span>
                <span style="color: #d97706; font-weight: 600;">${formatCurrency(d.pendingTransfers || 0)}</span>
              </div>
            </div>

            <div style="margin-top: 16px;">
              <div style="font-size: 12px; font-weight: 700; color: #dc2626; text-transform: uppercase; margin-bottom: 6px;">
                Initial Costs & Camp Expenditures
              </div>
              <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border);">
                <span>Initial Investment:</span>
                <span>${formatCurrency(d.initialInvestment || 0)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border);">
                <span>Printing & Production Costs:</span>
                <span>${formatCurrency(d.printingCost || 0)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border);">
                <span>Operating Expenses:</span>
                <span>${formatCurrency(d.otherExpenses || 0)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px; font-weight: 700; border-top: 2px solid var(--border); margin-top: 6px;">
                <span>Total Campaign Expenditure:</span>
                <span style="color: #dc2626;">${formatCurrency(d.totalExpenses || 0)}</span>
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- 2. TEAM LEADER VIEW -->
      ${isLeader ? html`
        <div>
          <!-- Team Financial Summary Card -->
          <div class="card" style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; border: none; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.25);">
            <div style="font-size: 13px; opacity: 0.9;">Total Team Collections</div>
            <div style="font-size: 30px; font-weight: 800; margin-top: 2px;">
              ${formatCurrency(ld.totalCollected || 0)}
            </div>
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2); display: flex; justify-content: space-between; font-size: 13px;">
              <span>Total Distributed:</span>
              <b style="font-size: 15px; color: #ffffff;">
                ${ld.totalDistributed || 0} Calendars
              </b>
            </div>
          </div>

          <!-- Team Financial Stats Grid -->
          <div class="stats-grid" style="margin-bottom: 12px;">
            <div class="stat-card">
              <div class="stat-value" style="color: #059669;">${formatCurrency(ld.totalCollected || 0)}</div>
              <div class="stat-label">Total Collected</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="color: var(--primary);">${expenses.length}</div>
              <div class="stat-label">Team Expenses</div>
            </div>
          </div>

          <div class="card" style="background: #f8fafc; border-left: 4px solid var(--primary); font-size: 12.5px; color: var(--text-secondary); margin-bottom: 14px;">
            ℹ️ <b>Team Leader Scoping:</b> Showing financial activity for your assigned team. Overall campaign initial printing investments are managed centrally by Super Admin & Usthad.
          </div>
        </div>
      ` : ''}

      <!-- 3. TEAM MEMBER VIEW -->
      ${isMember ? html`
        <div>
          <!-- Personal Financial Summary Card -->
          <div class="card" style="background: linear-gradient(135deg, #0284c7 0%, #1e40af 100%); color: white; border: none; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.25);">
            <div style="font-size: 13px; opacity: 0.9;">My Calendar Sales & Collections</div>
            <div style="font-size: 28px; font-weight: 800; margin-top: 2px;">
              ${formatCurrency((mp.totalCollected || 0) + (mp.totalOtherIncome || 0))}
            </div>
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2); display: flex; justify-content: space-between; font-size: 13px;">
              <span>Cash Remaining in My Hand:</span>
              <b style="font-size: 15px; color: ${(mp.cashInHand || 0) > 0 ? '#fde047' : '#86efac'};">
                ${formatCurrency(mp.cashInHand || 0)}
              </b>
            </div>
          </div>

          <div class="stats-grid" style="margin-bottom: 12px;">
            <div class="stat-card">
              <div class="stat-value" style="color: #059669;">${formatCurrency(mp.totalCollected || 0)}</div>
              <div class="stat-label">Calendar Sales</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="color: #3b82f6;">${formatCurrency(mp.totalOtherIncome || 0)}</div>
              <div class="stat-label">Other Income</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="color: #10b981;">${formatCurrency(mp.confirmedTransfers || 0)}</div>
              <div class="stat-label">Confirmed Handed</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="color: #f59e0b;">${formatCurrency(mp.pendingTransfers || 0)}</div>
              <div class="stat-label">Pending Handover</div>
            </div>
          </div>

          <div class="card" style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px; padding: 12px; margin-bottom: 14px;">
            <div style="font-weight: 700; color: #166534; font-size: 13px; margin-bottom: 4px;">
              Handover Guidance
            </div>
            <p style="font-size: 12px; color: #15803d; line-height: 1.45; margin: 0;">
              Once you collect money from calendar sales or donations, please submit a transfer record to your Team Leader or Usthad. Handovers are tracked separately from sales so your collections are never double-counted.
            </p>
          </div>
        </div>
      ` : ''}

      <!-- Recent Expense Entries List (Filtered by user permissions) -->
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div class="card-title" style="margin-bottom: 0;">Recent Expense Entries</div>
          <span class="badge badge-info" style="font-size: 11px;">${expenses.length} Records</span>
        </div>

        ${expenses.length === 0
          ? html`<div class="empty-state"><p>No expense entries recorded yet.</p></div>`
          : expenses.map((expense) => html`
              <div class="list-item" key=${expense._id}>
                <div class="list-content">
                  <div class="list-title">${expense.description}</div>
                  <div class="list-subtitle">
                    ${expense.category.toUpperCase()} · ${formatDate(expense.date)}
                    ${expense.createdBy ? ` · ${expense.createdBy.fullName}` : ''}
                    ${expense.status ? ` · (${expense.status})` : ''}
                  </div>
                </div>
                <b style="color: #dc2626; font-size: 14px;">${formatCurrency(expense.amount)}</b>
              </div>
            `)}
      </div>

      <!-- Accounting Policy Banner -->
      <div class="card" style="background: #f8fafc; border-left: 4px solid var(--primary); font-size: 12.5px; color: var(--text-secondary);">
        <b>Campaign Financial Policy:</b> Field collections and handovers are logged separately to prevent phantom credits. Expenditures are audited against verified physical camp receipts.
      </div>
    </div>
  `;
}
