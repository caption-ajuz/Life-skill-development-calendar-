import api from '../services/api.js';
import db from '../services/db.js';
import { currentUser } from '../store/auth.js';
import { generateClientId, refreshPendingCount } from '../services/sync.js';
import { formatCurrency, formatDate, formatNumber } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Transfers() {
  const user = currentUser.value || {};
  const isSuperOrUsthad = ['super_admin', 'usthad'].includes(user.role);
  const isTeamLeader = user.role === 'team_leader';
  const isTeamMember = user.role === 'team_member';

  // Active Transaction Tab: 'transfers' | 'collections' | 'distributions' | 'expenses'
  const [activeTab, setActiveTab] = useState('transfers');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Data lists
  const [transfers, setTransfers] = useState([]);
  const [collections, setCollections] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [areas, setAreas] = useState([]);

  // Form states for recording new handover
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [toDescription, setToDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Universal Edit Entry Modal State
  const [editingItem, setEditingItem] = useState(null); // { item, type: 'collection'|'distribution'|'transfer'|'expense' }
  const [editAmount, setEditAmount] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editAreaId, setEditAreaId] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('transport');
  const [editToDescription, setEditToDescription] = useState('');
  const [editRecipientName, setEditRecipientName] = useState('');
  const [editRecipientPhone, setEditRecipientPhone] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Load areas on mount
  useEffect(() => {
    api.get('/api/areas').then((res) => {
      if (res && res.success && res.data) setAreas(res.data);
    }).catch(() => {});
  }, []);

  // Load records based on active tab
  const loadRecords = async () => {
    setLoading(true);
    try {
      if (activeTab === 'transfers') {
        const params = filterStatus !== 'all' ? { status: filterStatus } : {};
        const res = await api.get('/api/transfers', params);
        if (res && res.success && res.data) {
          setTransfers(res.data.transfers || []);
        }
      } else if (activeTab === 'collections') {
        const params = { type: 'collection' };
        if (filterStatus !== 'all') params.status = filterStatus;
        const res = await api.get('/api/reports/data', params);
        if (res && res.success && res.data) {
          setCollections(res.data || []);
        }
      } else if (activeTab === 'distributions') {
        const params = { type: 'distribution' };
        if (filterStatus !== 'all') params.status = filterStatus;
        const res = await api.get('/api/reports/data', params);
        if (res && res.success && res.data) {
          setDistributions(res.data || []);
        }
      } else if (activeTab === 'expenses') {
        const res = await api.get('/api/expenses');
        if (res && res.success && res.data) {
          setExpenses(res.data.expenses || []);
        }
      }
    } catch (err) {
      console.warn('Could not load transaction records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [activeTab, filterStatus]);

  // Check if current user has permission to edit an entry
  const canEditEntry = (item, type) => {
    if (isSuperOrUsthad) return true;
    const userId = user._id ? user._id.toString() : '';

    if (type === 'transfer') {
      const fromId = item.fromUserId ? (item.fromUserId._id || item.fromUserId).toString() : '';
      if (fromId === userId) return true;
      if (isTeamLeader) {
        const leaderTeamId = user.teamId ? (user.teamId._id || user.teamId).toString() : '';
        const itemTeamId = item.teamId ? (item.teamId._id || item.teamId).toString() : '';
        return leaderTeamId && leaderTeamId === itemTeamId;
      }
      return false;
    }

    if (type === 'collection' || type === 'distribution') {
      const memberId = item.memberId ? (item.memberId._id || item.memberId).toString() : '';
      if (memberId === userId) return true;
      if (isTeamLeader) {
        const leaderTeamId = user.teamId ? (user.teamId._id || user.teamId).toString() : '';
        const itemTeamId = item.teamId ? (item.teamId._id || item.teamId).toString() : '';
        return leaderTeamId && leaderTeamId === itemTeamId;
      }
      return false;
    }

    if (type === 'expense') {
      const createdById = item.createdBy ? (item.createdBy._id || item.createdBy).toString() : '';
      if (createdById === userId) return true;
      if (isTeamLeader) {
        const leaderTeamId = user.teamId ? (user.teamId._id || user.teamId).toString() : '';
        const itemTeamId = item.teamId ? (item.teamId._id || item.teamId).toString() : '';
        return leaderTeamId && leaderTeamId === itemTeamId;
      }
      return false;
    }

    return false;
  };

  // Open Edit Modal and prefill current values
  const openEditModal = (item, type) => {
    setEditingItem({ item, type });
    setEditAmount(item.amount !== undefined ? String(item.amount) : '');
    setEditQuantity(item.quantity !== undefined ? String(item.quantity) : '');
    const rawDate = item.date || item.transferDate || new Date();
    setEditDate(new Date(rawDate).toISOString().split('T')[0]);
    setEditAreaId(item.areaId ? (item.areaId._id || item.areaId) : '');
    setEditNotes(item.notes || '');
    setEditDescription(item.description || '');
    setEditCategory(item.category || 'transport');
    setEditToDescription(item.toDescription || '');
    setEditRecipientName(item.recipientName || '');
    setEditRecipientPhone(item.recipientPhone || '');
  };

  // Save changes to edited entry
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    const { item, type } = editingItem;
    setSavingEdit(true);

    try {
      if (type === 'collection') {
        const amt = parseFloat(editAmount);
        if (isNaN(amt) || amt < 0) {
          if (window.showToast) window.showToast('Please enter a valid amount.', 'error');
          return;
        }
        await api.put(`/api/collections/${item._id}`, {
          amount: amt,
          date: editDate,
          areaId: editAreaId || null,
          notes: editNotes.trim()
        });
      } else if (type === 'distribution') {
        const qty = parseInt(editQuantity, 10);
        if (isNaN(qty) || qty < 0) {
          if (window.showToast) window.showToast('Please enter a valid quantity.', 'error');
          return;
        }
        await api.put(`/api/distributions/${item._id}`, {
          quantity: qty,
          date: editDate,
          areaId: editAreaId || null,
          notes: editNotes.trim(),
          recipientName: editRecipientName.trim(),
          recipientPhone: editRecipientPhone.trim()
        });
      } else if (type === 'transfer') {
        const amt = parseFloat(editAmount);
        if (isNaN(amt) || amt <= 0) {
          if (window.showToast) window.showToast('Please enter a valid transfer amount.', 'error');
          return;
        }
        await api.put(`/api/transfers/${item._id}`, {
          amount: amt,
          toDescription: editToDescription.trim(),
          transferDate: editDate,
          notes: editNotes.trim()
        });
      } else if (type === 'expense') {
        const amt = parseFloat(editAmount);
        if (isNaN(amt) || amt <= 0) {
          if (window.showToast) window.showToast('Please enter a valid expense amount.', 'error');
          return;
        }
        await api.put(`/api/expenses/${item._id}`, {
          amount: amt,
          category: editCategory,
          description: editDescription.trim(),
          date: editDate
        });
      }

      if (window.showToast) window.showToast('Entry updated successfully! ✓', 'success');
      setEditingItem(null);
      loadRecords();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to update entry.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete an entry
  const handleDeleteEntry = async (item, type) => {
    try {
      if (type === 'collection') {
        await api.del(`/api/collections/${item._id}`);
      } else if (type === 'distribution') {
        await api.del(`/api/distributions/${item._id}`);
      } else if (type === 'transfer') {
        await api.del(`/api/transfers/${item._id}`);
      } else if (type === 'expense') {
        await api.del(`/api/expenses/${item._id}`);
      }
      if (window.showToast) window.showToast('Entry deleted successfully! ✓', 'success');
      loadRecords();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to delete entry.', 'error');
    }
  };

  // Record Handover
  const handleCreateTransfer = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      if (window.showToast) window.showToast('Please enter a valid transfer amount.', 'error');
      return;
    }
    if (!toDescription.trim()) {
      if (window.showToast) window.showToast('Please enter whom the money was handed to.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/api/transfers', {
        amount: amt,
        toDescription: toDescription.trim(),
        notes: notes.trim()
      });
      if (res && res.success) {
        if (window.showToast) window.showToast('Money transfer recorded and submitted for verification! ✓', 'success');
      }
      setAmount('');
      setToDescription('');
      setNotes('');
      setShowForm(false);
      loadRecords();
    } catch (err) {
      console.warn('Network error recording transfer, saving offline:', err);
      const clientId = generateClientId();
      await db.addPending('pendingTransfers', {
        clientId,
        amount: amt,
        toDescription: toDescription.trim(),
        notes: notes.trim()
      });
      await refreshPendingCount();
      if (window.showToast) window.showToast('Saved offline. Will sync when connected.', 'warning');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (id, amt) => {
    try {
      await api.put(`/api/transfers/${id}/confirm`, {});
      if (window.showToast) window.showToast('Transfer confirmed successfully! ✓', 'success');
      loadRecords();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to confirm transfer.', 'error');
    }
  };

  const handleDispute = async (id) => {
    const reason = prompt('Please enter the reason for disputing this transfer record:');
    if (!reason || !reason.trim()) return;
    try {
      await api.put(`/api/transfers/${id}/dispute`, { reason: reason.trim() });
      if (window.showToast) window.showToast('Transfer flagged as disputed.', 'warning');
      loadRecords();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to dispute transfer.', 'error');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'confirmed':
      case 'approved':
      case 'active':
        return html`<span class="badge badge-success">Approved / Active</span>`;
      case 'awaiting_confirmation':
      case 'pending':
        return html`<span class="badge badge-warning">Pending Review</span>`;
      case 'disputed':
      case 'rejected':
        return html`<span class="badge badge-error">Disputed / Rejected</span>`;
      case 'corrected':
        return html`<span class="badge badge-info">Corrected</span>`;
      default:
        return html`<span class="badge badge-neutral">${status}</span>`;
    }
  };

  // Filter current list by search query
  const getFilteredItems = (items) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => {
      const desc = (item.description || item.notes || item.toDescription || item.recipientName || '').toLowerCase();
      const member = (item.memberId ? item.memberId.fullName : item.fromUserId ? item.fromUserId.fullName : item.createdBy ? item.createdBy.fullName : '').toLowerCase();
      const area = (item.areaId ? item.areaId.name : '').toLowerCase();
      return desc.includes(q) || member.includes(q) || area.includes(q);
    });
  };

  return html`
    <div class="page">
      <!-- Page Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div>
          <h2 style="font-size: 19px; font-weight: 800; color: #0f172a; margin: 0;">
            Transactions & Transfers
          </h2>
          <p style="font-size: 12px; color: var(--text-secondary); margin: 2px 0 0;">
            Review, edit & manage collections, distributions, transfers & expenses
          </p>
        </div>
        ${activeTab === 'transfers' ? html`
          <button
            class="btn btn-primary btn-sm"
            onClick=${() => setShowForm(!showForm)}
            style="font-weight: 700;"
          >
            ${showForm ? 'Cancel' : '+ Handover'}
          </button>
        ` : activeTab === 'collections' ? html`
          <a href="#/collections?action=new" class="btn btn-primary btn-sm" style="font-weight: 700; text-decoration: none;">
            + Collection
          </a>
        ` : activeTab === 'distributions' ? html`
          <a href="#/distributions?action=new" class="btn btn-primary btn-sm" style="font-weight: 700; text-decoration: none;">
            + Distribute
          </a>
        ` : html`
          <a href="#/profile?tab=expenses" class="btn btn-primary btn-sm" style="font-weight: 700; text-decoration: none;">
            + Expense
          </a>
        `}
      </div>

      <!-- Top Tabs: Collections | Distributions | Transfers | Expenses -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 12px;">
        <button
          type="button"
          class="btn ${activeTab === 'collections' ? 'btn-primary' : 'btn-secondary'} btn-sm"
          style="font-size: 11.5px; padding: 7px 2px; font-weight: 700;"
          onClick=${() => { setActiveTab('collections'); setFilterStatus('all'); }}
        >
          💰 Collect
        </button>
        <button
          type="button"
          class="btn ${activeTab === 'distributions' ? 'btn-primary' : 'btn-secondary'} btn-sm"
          style="font-size: 11.5px; padding: 7px 2px; font-weight: 700;"
          onClick=${() => { setActiveTab('distributions'); setFilterStatus('all'); }}
        >
          📦 Distribute
        </button>
        <button
          type="button"
          class="btn ${activeTab === 'transfers' ? 'btn-primary' : 'btn-secondary'} btn-sm"
          style="font-size: 11.5px; padding: 7px 2px; font-weight: 700;"
          onClick=${() => { setActiveTab('transfers'); setFilterStatus('all'); }}
        >
          🤝 Handover
        </button>
        <button
          type="button"
          class="btn ${activeTab === 'expenses' ? 'btn-primary' : 'btn-secondary'} btn-sm"
          style="font-size: 11.5px; padding: 7px 2px; font-weight: 700;"
          onClick=${() => { setActiveTab('expenses'); setFilterStatus('all'); }}
        >
          🧾 Expense
        </button>
      </div>

      <!-- Search & Status Filter -->
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <input
          type="text"
          class="form-input"
          placeholder="Search by name, area, note..."
          value=${searchQuery}
          onInput=${(e) => setSearchQuery(e.target.value)}
          style="font-size: 12.5px; padding: 6px 10px;"
        />
        <select
          class="form-input"
          value=${filterStatus}
          onChange=${(e) => setFilterStatus(e.target.value)}
          style="width: 120px; font-size: 12px; padding: 6px 8px;"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="confirmed">Confirmed</option>
          <option value="disputed">Disputed</option>
        </select>
      </div>

      <!-- Record Handover Form (when active) -->
      ${showForm && activeTab === 'transfers' ? html`
        <div class="card" style="border: 2px solid var(--primary); animation: slideUp 0.2s; margin-bottom: 14px;">
          <div class="card-title">Record Handover of Collected Money</div>
          <form onSubmit=${handleCreateTransfer}>
            <div class="form-group">
              <label class="form-label">Amount Handed Over (₹)</label>
              <input
                type="tel"
                pattern="[0-9]*"
                class="form-input"
                placeholder="e.g. 5000"
                value=${amount}
                onInput=${(e) => setAmount(e.target.value)}
                required
                style="font-size: 20px; font-weight: 700; color: var(--primary);"
              />
            </div>
            <div class="form-group">
              <label class="form-label">Handed Over To</label>
              <input
                type="text"
                class="form-input"
                placeholder="e.g. Usthad Mohammed, Camp Treasurer, Bank Deposit"
                value=${toDescription}
                onInput=${(e) => setToDescription(e.target.value)}
                required
              />
            </div>
            <div class="form-group">
              <label class="form-label">Notes (Optional)</label>
              <input
                type="text"
                class="form-input"
                placeholder="e.g. Bank slip reference, cash handover at office"
                value=${notes}
                onInput=${(e) => setNotes(e.target.value)}
              />
            </div>
            <button
              type="submit"
              class="btn btn-primary btn-full"
              disabled=${submitting}
            >
              ${submitting ? 'Submitting...' : 'Submit Handover Record'}
            </button>
          </form>
        </div>
      ` : ''}

      <!-- UNIVERSAL EDIT ENTRY MODAL -->
      ${editingItem ? html`
        <div class="modal-overlay" style="z-index: 9999;" onClick=${(e) => { if (e.target === e.currentTarget) setEditingItem(null); }}>
          <div class="modal" onClick=${(e) => e.stopPropagation()} style="max-width: 520px;">
            <div class="modal-header">
              <div class="modal-title">
                ✏️ Edit ${editingItem.type === 'collection' ? 'Collection Entry' : editingItem.type === 'distribution' ? 'Distribution Entry' : editingItem.type === 'transfer' ? 'Handover Transfer' : 'Expense Record'}
              </div>
              <button onClick=${() => setEditingItem(null)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
            </div>

            <form onSubmit=${handleSaveEdit}>
              <!-- Amount or Quantity -->
              ${editingItem.type === 'distribution' ? html`
                <div class="form-group">
                  <label class="form-label">Quantity Distributed (Calendars)</label>
                  <input
                    type="number"
                    min="1"
                    class="form-input"
                    value=${editQuantity}
                    onInput=${(e) => setEditQuantity(e.target.value)}
                    required
                    style="font-size: 18px; font-weight: 700; color: #0284c7;"
                  />
                </div>
              ` : html`
                <div class="form-group">
                  <label class="form-label">Amount (₹)</label>
                  <input
                    type="number"
                    min="1"
                    class="form-input"
                    value=${editAmount}
                    onInput=${(e) => setEditAmount(e.target.value)}
                    required
                    style="font-size: 18px; font-weight: 700; color: #059669;"
                  />
                </div>
              `}

              <!-- Date Picker -->
              <div class="form-group">
                <label class="form-label">Date</label>
                <input
                  type="date"
                  class="form-input"
                  value=${editDate}
                  onInput=${(e) => setEditDate(e.target.value)}
                  required
                />
              </div>

              <!-- Area Dropdown (for Collections & Distributions) -->
              ${(editingItem.type === 'collection' || editingItem.type === 'distribution') ? html`
                <div class="form-group">
                  <label class="form-label">Area / Location</label>
                  <select
                    class="form-input"
                    value=${editAreaId}
                    onChange=${(e) => setEditAreaId(e.target.value)}
                  >
                    <option value="">(Select Area)</option>
                    ${areas.map((a) => html`
                      <option key=${a._id} value=${a._id}>${a.name} ${a.district ? `(${a.district})` : ''}</option>
                    `)}
                  </select>
                </div>
              ` : ''}

              <!-- Expense Category -->
              ${editingItem.type === 'expense' ? html`
                <div class="form-group">
                  <label class="form-label">Category</label>
                  <select
                    class="form-input"
                    value=${editCategory}
                    onChange=${(e) => setEditCategory(e.target.value)}
                  >
                    <option value="transport">Transport</option>
                    <option value="food">Food & Refreshments</option>
                    <option value="printing">Printing</option>
                    <option value="communication">Communication</option>
                    <option value="stationery">Stationery</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Description / Reason</label>
                  <input
                    type="text"
                    class="form-input"
                    value=${editDescription}
                    onInput=${(e) => setEditDescription(e.target.value)}
                    required
                  />
                </div>
              ` : ''}

              <!-- Transfer Handed To -->
              ${editingItem.type === 'transfer' ? html`
                <div class="form-group">
                  <label class="form-label">Handed Over To</label>
                  <input
                    type="text"
                    class="form-input"
                    value=${editToDescription}
                    onInput=${(e) => setEditToDescription(e.target.value)}
                    required
                  />
                </div>
              ` : ''}

              <!-- Distribution Recipient Details -->
              ${editingItem.type === 'distribution' ? html`
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                  <div class="form-group">
                    <label class="form-label">Recipient Name</label>
                    <input
                      type="text"
                      class="form-input"
                      placeholder="e.g. Shop owner"
                      value=${editRecipientName}
                      onInput=${(e) => setEditRecipientName(e.target.value)}
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Recipient Phone</label>
                    <input
                      type="tel"
                      class="form-input"
                      placeholder="e.g. 9876543210"
                      value=${editRecipientPhone}
                      onInput=${(e) => setEditRecipientPhone(e.target.value)}
                    />
                  </div>
                </div>
              ` : ''}

              <!-- Notes / Remarks -->
              <div class="form-group">
                <label class="form-label">Notes / Remarks</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="Optional notes or correction details"
                  value=${editNotes}
                  onInput=${(e) => setEditNotes(e.target.value)}
                />
              </div>

              <!-- Buttons -->
              <div style="display: flex; gap: 8px; margin-top: 14px;">
                <button
                  type="button"
                  class="btn btn-secondary"
                  style="flex: 1;"
                  onClick=${() => setEditingItem(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  style="flex: 2; font-weight: 700;"
                  disabled=${savingEdit}
                >
                  ${savingEdit ? 'Saving...' : 'Save Changes ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ` : ''}

      <!-- List of Records -->
      ${loading ? html`
        <div style="height: 120px;" class="skeleton"></div>
      ` : html`
        <div>
          <!-- Tab 1: Transfers (Handovers) -->
          ${activeTab === 'transfers' ? html`
            ${getFilteredItems(transfers).length === 0 ? html`
              <div class="empty-state"><p>No handover transfer records found.</p></div>
            ` : getFilteredItems(transfers).map((t) => html`
              <div class="card" key=${t._id} style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div>
                    <div style="font-size: 16px; font-weight: 700; color: #0f172a;">
                      ${formatCurrency(t.amount)}
                    </div>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
                      Handed to: <b>${t.toDescription}</b>
                    </div>
                    <div style="font-size: 12px; color: var(--text-light); margin-top: 2px;">
                      By: <b>${t.fromUserId ? t.fromUserId.fullName : 'Member'}</b> ${t.teamId ? `(${t.teamId.name})` : ''} • ${formatDate(t.transferDate)}
                    </div>
                    ${t.notes ? html`<div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; font-style: italic;">"${t.notes}"</div>` : ''}
                    ${t.disputeReason ? html`<div style="font-size: 12px; color: #dc2626; margin-top: 4px;">Dispute: ${t.disputeReason}</div>` : ''}
                  </div>
                  <div style="text-align: right;">
                    ${getStatusBadge(t.status)}
                  </div>
                </div>

                <!-- Action Toolbar: Edit & Super Admin Verification -->
                <div style="display: flex; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #f1f5f9; align-items: center; flex-wrap: wrap;">
                  ${canEditEntry(t, 'transfer') ? html`
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      style="font-size: 11px; padding: 4px 8px; font-weight: 600;"
                      onClick=${() => openEditModal(t, 'transfer')}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline btn-sm"
                      style="font-size: 11px; padding: 4px 8px; color: #dc2626; border-color: #fca5a5;"
                      onClick=${() => handleDeleteEntry(t, 'transfer')}
                    >
                      🗑️ Delete
                    </button>
                  ` : ''}

                  ${isSuperOrUsthad && (t.status === 'awaiting_confirmation' || t.status === 'pending') ? html`
                    <button
                      class="btn btn-success btn-sm"
                      style="font-size: 11px; padding: 4px 10px; margin-left: auto;"
                      onClick=${() => handleConfirm(t._id, t.amount)}
                    >
                      ✓ Confirm Received
                    </button>
                    <button
                      class="btn btn-danger btn-sm"
                      style="font-size: 11px; padding: 4px 10px;"
                      onClick=${() => handleDispute(t._id)}
                    >
                      ✕ Dispute
                    </button>
                  ` : ''}
                </div>
              </div>
            `)}
          ` : ''}

          <!-- Tab 2: Collections (Income / Sales) -->
          ${activeTab === 'collections' ? html`
            ${getFilteredItems(collections).length === 0 ? html`
              <div class="empty-state"><p>No collection records found.</p></div>
            ` : getFilteredItems(collections).map((col) => html`
              <div class="card" key=${col._id} style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div>
                    <div style="font-size: 16px; font-weight: 700; color: #059669;">
                      ${formatCurrency(col.amount)}
                    </div>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
                      Member: <b>${col.memberId ? col.memberId.fullName : 'Member'}</b> ${col.teamId ? `(${col.teamId.name})` : ''}
                    </div>
                    <div style="font-size: 12px; color: var(--text-light); margin-top: 2px;">
                      Area: ${col.areaId ? col.areaId.name : 'General'} • Date: ${formatDate(col.date)}
                    </div>
                    ${col.notes ? html`<div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; font-style: italic;">"${col.notes}"</div>` : ''}
                  </div>
                  <div style="text-align: right;">
                    ${getStatusBadge(col.approvalStatus || col.status)}
                  </div>
                </div>

                <div style="display: flex; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #f1f5f9; align-items: center;">
                  ${canEditEntry(col, 'collection') ? html`
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      style="font-size: 11px; padding: 4px 8px; font-weight: 600;"
                      onClick=${() => openEditModal(col, 'collection')}
                    >
                      ✏️ Edit Entry
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline btn-sm"
                      style="font-size: 11px; padding: 4px 8px; color: #dc2626; border-color: #fca5a5;"
                      onClick=${() => handleDeleteEntry(col, 'collection')}
                    >
                      🗑️ Delete
                    </button>
                  ` : ''}
                </div>
              </div>
            `)}
          ` : ''}

          <!-- Tab 3: Distributions (Calendars Distributed) -->
          ${activeTab === 'distributions' ? html`
            ${getFilteredItems(distributions).length === 0 ? html`
              <div class="empty-state"><p>No distribution records found.</p></div>
            ` : getFilteredItems(distributions).map((dist) => html`
              <div class="card" key=${dist._id} style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div>
                    <div style="font-size: 16px; font-weight: 700; color: #0284c7;">
                      ${formatNumber(dist.quantity)} calendars
                    </div>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
                      Member: <b>${dist.memberId ? dist.memberId.fullName : 'Member'}</b> ${dist.teamId ? `(${dist.teamId.name})` : ''}
                    </div>
                    <div style="font-size: 12px; color: var(--text-light); margin-top: 2px;">
                      Area: ${dist.areaId ? dist.areaId.name : 'General'} • Date: ${formatDate(dist.date)}
                      ${dist.recipientName ? html` • Recipient: <b>${dist.recipientName}</b>` : ''}
                    </div>
                    ${dist.notes ? html`<div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; font-style: italic;">"${dist.notes}"</div>` : ''}
                  </div>
                  <div style="text-align: right;">
                    ${getStatusBadge(dist.approvalStatus || dist.status)}
                  </div>
                </div>

                <div style="display: flex; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #f1f5f9; align-items: center;">
                  ${canEditEntry(dist, 'distribution') ? html`
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      style="font-size: 11px; padding: 4px 8px; font-weight: 600;"
                      onClick=${() => openEditModal(dist, 'distribution')}
                    >
                      ✏️ Edit Entry
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline btn-sm"
                      style="font-size: 11px; padding: 4px 8px; color: #dc2626; border-color: #fca5a5;"
                      onClick=${() => handleDeleteEntry(dist, 'distribution')}
                    >
                      🗑️ Delete
                    </button>
                  ` : ''}
                </div>
              </div>
            `)}
          ` : ''}

          <!-- Tab 4: Expenses -->
          ${activeTab === 'expenses' ? html`
            ${getFilteredItems(expenses).length === 0 ? html`
              <div class="empty-state"><p>No expense records found.</p></div>
            ` : getFilteredItems(expenses).map((exp) => html`
              <div class="card" key=${exp._id} style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div>
                    <div style="font-size: 16px; font-weight: 700; color: #d97706;">
                      ${formatCurrency(exp.amount)}
                    </div>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
                      <b>${exp.description}</b> (${exp.category})
                    </div>
                    <div style="font-size: 12px; color: var(--text-light); margin-top: 2px;">
                      By: <b>${exp.createdBy ? exp.createdBy.fullName : 'Member'}</b> ${exp.teamId ? `(${exp.teamId.name})` : ''} • ${formatDate(exp.date)}
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <span class="badge badge-info">${exp.status || 'Recorded'}</span>
                  </div>
                </div>

                <div style="display: flex; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #f1f5f9; align-items: center;">
                  ${canEditEntry(exp, 'expense') ? html`
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      style="font-size: 11px; padding: 4px 8px; font-weight: 600;"
                      onClick=${() => openEditModal(exp, 'expense')}
                    >
                      ✏️ Edit Entry
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline btn-sm"
                      style="font-size: 11px; padding: 4px 8px; color: #dc2626; border-color: #fca5a5;"
                      onClick=${() => handleDeleteEntry(exp, 'expense')}
                    >
                      🗑️ Delete
                    </button>
                  ` : ''}
                </div>
              </div>
            `)}
          ` : ''}
        </div>
      `}
    </div>
  `;
}
