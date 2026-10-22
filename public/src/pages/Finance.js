import api from '../services/api.js';
import { currentUser } from '../store/auth.js';
import { formatCurrency, formatDate } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Finance() {
  const user = currentUser.value;
  const [data, setData] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add Expense form
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseCat, setExpenseCat] = useState('transport');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const loadFinancialData = async () => {
    try {
      const [dashboardRes, expensesRes] = await Promise.all([
        api.get('/api/dashboard/admin'),
        api.get('/api/expenses')
      ]);
      if (dashboardRes && dashboardRes.success) setData(dashboardRes.data);
      if (expensesRes && expensesRes.success) setExpenses(expensesRes.data.expenses || []);
    } catch (err) {
      if (window.showToast) window.showToast('Failed to load financial records.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinancialData();
  }, []);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount);
    if (isNaN(amt) || amt <= 0 || !expenseDesc.trim()) {
      if (window.showToast) window.showToast('Enter a description and a valid amount.', 'error');
      return;
    }

    setSubmitting(true);
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
      setSubmitting(false);
    }
  };

  if (!user || !['super_admin', 'usthad'].includes(user.role)) {
    return html`<div class="page"><div class="empty-state"><p>Campaign financial information is only available to authorized supervisors.</p></div></div>`;
  }

  if (loading) {
    return html`<div class="page"><div style="height: 140px;" class="skeleton"></div></div>`;
  }

  const d = data || {};

  return html`
    <div class="page">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div>
          <h2 style="font-size: 19px; font-weight: 700;">Financial Overview</h2>
          <p style="font-size: 12px; color: var(--text-secondary);">Campaign investments, costs, and net balance</p>
        </div>
        <button class="btn btn-primary btn-sm" onClick=${() => setShowAddExpense(!showAddExpense)}>
          ${showAddExpense ? 'Cancel' : '+ Add Expense'}
        </button>
      </div>

      ${showAddExpense ? html`
        <div class="card">
          <div class="card-title">Record Campaign Expense</div>
          <form onSubmit=${handleAddExpense}>
            <div class="form-group">
              <label class="form-label">Category</label>
              <select class="form-input" value=${expenseCat} onChange=${(e) => setExpenseCat(e.target.value)}>
                <option value="transport">Transport</option>
                <option value="food">Food</option>
                <option value="communication">Communication</option>
                <option value="stationery">Stationery</option>
                <option value="printing">Printing</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <input class="form-input" type="text" maxlength="300" value=${expenseDesc} onInput=${(e) => setExpenseDesc(e.target.value)} required />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div class="form-group">
                <label class="form-label">Amount (₹)</label>
                <input class="form-input" type="number" min="0.01" step="0.01" inputmode="decimal" value=${expenseAmount} onInput=${(e) => setExpenseAmount(e.target.value)} required />
              </div>
              <div class="form-group">
                <label class="form-label">Date</label>
                <input class="form-input" type="date" value=${expenseDate} onInput=${(e) => setExpenseDate(e.target.value)} required />
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-full" disabled=${submitting}>
              ${submitting ? 'Saving...' : 'Save Expense'}
            </button>
          </form>
        </div>
      ` : ''}

      <!-- Net Financial Summary Card -->
      <div class="card" style="background: linear-gradient(135deg, #0891b2, #1d4ed8); color: white; border: none;">
        <div style="font-size: 13px; opacity: 0.9;">Total Campaign Collections</div>
        <div style="font-size: 28px; font-weight: 700; margin-top: 2px;">${formatCurrency(d.totalCollected || 0)}</div>
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2); display: flex; justify-content: space-between; font-size: 13px;">
          <span>Net Balance (Profit / Loss):</span>
          <b style="font-size: 16px; color: ${(d.netProfitOrLoss || 0) >= 0 ? '#34d399' : '#fca5a5'};">
            ${formatCurrency(d.netProfitOrLoss || 0)}
          </b>
        </div>
      </div>

      <!-- Financial Breakdown -->
      <div class="card">
        <div class="card-title">Income & Expenditure Breakdown</div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 12px; font-weight: 700; color: #059669; text-transform: uppercase; margin-bottom: 6px;">
            Income
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border);">
            <span>Total Collections Recorded:</span>
            <b style="color: #059669;">${formatCurrency(d.totalCollected || 0)}</b>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border);">
            <span style="color: var(--text-secondary); padding-left: 10px;">• Confirmed in Account:</span>
            <span>${formatCurrency(d.confirmedTransfers || 0)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
            <span style="color: var(--text-secondary); padding-left: 10px;">• Pending Handover/Bank:</span>
            <span style="color: #d97706;">${formatCurrency(d.pendingTransfers || 0)}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Recent Expense Entries</div>
          ${expenses.length === 0
            ? html`<div class="empty-state"><p>No expense entries recorded yet.</p></div>`
            : expenses.map((expense) => html`
                <div class="list-item" key=${expense._id}>
                  <div class="list-content">
                    <div class="list-title">${expense.description}</div>
                    <div class="list-subtitle">${expense.category} · ${formatDate(expense.date)}${expense.createdBy ? ` · ${expense.createdBy.fullName}` : ''}</div>
                  </div>
                  <b style="color: #dc2626;">${formatCurrency(expense.amount)}</b>
                </div>
              `)}
        </div>

        <div style="margin-top: 16px;">
          <div style="font-size: 12px; font-weight: 700; color: #dc2626; text-transform: uppercase; margin-bottom: 6px;">
            Costs & Investments
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border);">
            <span>Initial Investment:</span>
            <span>${formatCurrency(d.initialInvestment || 0)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border);">
            <span>Printing Costs:</span>
            <span>${formatCurrency(d.printingCost || 0)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid var(--border);">
            <span>Other Operating Expenses:</span>
            <span>${formatCurrency(d.otherExpenses || 0)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px; font-weight: 700; border-top: 2px solid var(--border); margin-top: 6px;">
            <span>Total Campaign Expenditure:</span>
            <span style="color: #dc2626;">${formatCurrency(d.totalExpenses || 0)}</span>
          </div>
        </div>
      </div>

      <!-- Accounting Note Alert -->
      <div class="card" style="background: #f8fafc; border-left: 4px solid var(--primary); font-size: 13px; color: var(--text-secondary);">
        <b>Campaign Audit Policy:</b> Collections recorded by field members are separated from bank-confirmed handovers to prevent double-counting or phantom receipts. Net profit is calculated only after full cost reconciliation.
      </div>
    </div>
  `;
}
