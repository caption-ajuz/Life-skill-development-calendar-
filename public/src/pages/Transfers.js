import api from '../services/api.js';
import db from '../services/db.js';
import { currentUser } from '../store/auth.js';
import { generateClientId, refreshPendingCount } from '../services/sync.js';
import { formatCurrency, formatDate } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Transfers() {
  const user = currentUser.value;
  const isVerifier = ['super_admin', 'usthad'].includes(user ? user.role : '');

  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');

  // Form states for recording handover
  const [amount, setAmount] = useState('');
  const [toDescription, setToDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadTransfers = async () => {
    try {
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const res = await api.get('/api/transfers', params);
      if (res && res.success && res.data) {
        setTransfers(res.data.transfers || []);
      }
    } catch (err) {
      console.warn('Could not load transfers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransfers();
  }, [filterStatus]);

  const handleCreateTransfer = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      if (window.showToast) window.showToast('Please enter a valid amount.', 'error');
      return;
    }

    if (!toDescription.trim()) {
      if (window.showToast) window.showToast('Please specify to whom the money was handed.', 'error');
      return;
    }

    setSubmitting(true);

    try {
      const clientId = generateClientId();
      const transferData = {
        clientId,
        amount: amt,
        toDescription: toDescription.trim(),
        notes: notes.trim(),
        transferDate: new Date().toISOString()
      };

      if (navigator.onLine) {
        await api.post('/api/transfers', transferData);
        if (window.showToast) window.showToast('Money transfer recorded! Awaiting confirmation.', 'success');
      } else {
        await db.addPending('pendingTransfers', transferData);
        await refreshPendingCount();
        if (window.showToast) window.showToast('Offline: Transfer saved and queued for sync.', 'info');
      }

      setAmount('');
      setToDescription('');
      setNotes('');
      setShowForm(false);
      loadTransfers();
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
    if (!confirm(`Are you sure you want to confirm receipt of ${formatCurrency(amt)}?`)) return;

    try {
      await api.put(`/api/transfers/${id}/confirm`, {});
      if (window.showToast) window.showToast('Transfer confirmed successfully! ✓', 'success');
      loadTransfers();
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
      loadTransfers();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to dispute transfer.', 'error');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'confirmed':
        return html`<span class="badge badge-success">Confirmed</span>`;
      case 'awaiting_confirmation':
      case 'pending':
        return html`<span class="badge badge-warning">Awaiting Confirmation</span>`;
      case 'disputed':
        return html`<span class="badge badge-error">Disputed</span>`;
      default:
        return html`<span class="badge badge-neutral">${status}</span>`;
    }
  };

  return html`
    <div class="page">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h2 style="font-size: 18px; font-weight: 700;">Money Transfers</h2>
        <button
          class="btn btn-primary btn-sm"
          onClick=${() => setShowForm(!showForm)}
        >
          ${showForm ? 'Cancel' : '+ Record Handover'}
        </button>
      </div>

      <!-- Record Handover Modal / Form -->
      ${showForm
        ? html`
            <div class="card" style="border: 2px solid var(--primary); animation: slideUp 0.2s;">
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
                    style="font-size: 22px; font-weight: 700; color: var(--primary);"
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
          `
        : ''}

      <!-- Filter Tabs -->
      <div class="tabs">
        <button
          class="tab ${filterStatus === 'all' ? 'active' : ''}"
          onClick=${() => setFilterStatus('all')}
        >
          All
        </button>
        <button
          class="tab ${filterStatus === 'awaiting_confirmation' ? 'active' : ''}"
          onClick=${() => setFilterStatus('awaiting_confirmation')}
        >
          Pending
        </button>
        <button
          class="tab ${filterStatus === 'confirmed' ? 'active' : ''}"
          onClick=${() => setFilterStatus('confirmed')}
        >
          Confirmed
        </button>
        <button
          class="tab ${filterStatus === 'disputed' ? 'active' : ''}"
          onClick=${() => setFilterStatus('disputed')}
        >
          Disputed
        </button>
      </div>

      <!-- Transfers List -->
      ${loading
        ? html`<div style="height: 120px;" class="skeleton"></div>`
        : transfers.length === 0
        ? html`
            <div class="empty-state">
              <p>No transfer records found in this category.</p>
            </div>
          `
        : html`
            <div>
              ${transfers.map(
                (t) => html`
                  <div class="card" key=${t._id} style="margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                      <div>
                        <div style="font-size: 16px; font-weight: 700; color: var(--text);">
                          ${formatCurrency(t.amount)}
                        </div>
                        <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
                          Handed to: <b>${t.toDescription}</b>
                        </div>
                        <div style="font-size: 12px; color: var(--text-light); margin-top: 2px;">
                          By: ${t.fromUserId ? t.fromUserId.fullName : 'Member'} ${t.teamId ? `(${t.teamId.name})` : ''} • ${formatDate(t.transferDate)}
                        </div>
                        ${t.notes ? html`<div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; font-style: italic;">"${t.notes}"</div>` : ''}
                        ${t.disputeReason ? html`<div style="font-size: 12px; color: #dc2626; margin-top: 4px;">Dispute Reason: ${t.disputeReason}</div>` : ''}
                      </div>
                      <div>
                        ${getStatusBadge(t.status)}
                      </div>
                    </div>

                    <!-- Super Admin & Usthad Action Buttons -->
                    ${isVerifier && (t.status === 'awaiting_confirmation' || t.status === 'pending')
                      ? html`
                          <div style="display: flex; gap: 8px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border);">
                            <button
                              class="btn btn-success btn-sm"
                              style="flex: 1;"
                              onClick=${() => handleConfirm(t._id, t.amount)}
                            >
                              ✓ Confirm Received
                            </button>
                            <button
                              class="btn btn-danger btn-sm"
                              style="flex: 1;"
                              onClick=${() => handleDispute(t._id)}
                            >
                              ✕ Dispute
                            </button>
                          </div>
                        `
                      : ''}
                  </div>
                `
              )}
            </div>
          `}
    </div>
  `;
}
