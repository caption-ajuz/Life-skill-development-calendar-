import api from '../services/api.js';
import db from '../services/db.js';
import { generateClientId, refreshPendingCount } from '../services/sync.js';
import { formatCurrency, formatDate } from '../utils/format.js';
import { currentUser } from '../store/auth.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Collections() {
  const user = currentUser.value;
  const canReview = user && ['super_admin', 'usthad', 'team_leader'].includes(user.role);

  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [sendThankYou, setSendThankYou] = useState(false);
  const [donorPhone, setDonorPhone] = useState('');
  const [donorName, setDonorName] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentEntries, setRecentEntries] = useState([]);

  // Approval review modal state
  const [rejectingItem, setRejectingItem] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Resubmit modal state
  const [resubmittingItem, setResubmittingItem] = useState(null);
  const [resubmitAmount, setResubmitAmount] = useState('');
  const [resubmitNotes, setResubmitNotes] = useState('');

  const loadAreas = async () => {
    try {
      const res = await api.get('/api/areas');
      if (res && res.success && res.data) setAreas(res.data);
    } catch (err) {
      console.warn('Could not fetch areas:', err);
    }
  };

  const loadRecent = async () => {
    try {
      const res = await api.get('/api/collections', { limit: 20 });
      if (res && res.success && res.data) {
        setRecentEntries(res.data.collections || []);
      }
    } catch (err) {
      console.warn('Could not fetch collections:', err);
    }
  };

  const handleApprove = async (id) => {
    setActionLoading(true);
    try {
      const res = await api.put(`/api/collections/${id}/approve`, {});
      if (res && res.success) {
        if (window.showToast) window.showToast('Collection entry approved! ✓', 'success');
        loadRecent();
      } else {
        if (window.showToast) window.showToast(res.error || 'Failed to approve', 'error');
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Error approving entry', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectionReason.trim()) {
      if (window.showToast) window.showToast('Please provide a reason for rejection.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const res = await api.put(`/api/collections/${rejectingItem._id}/reject`, { reason: rejectionReason.trim() });
      if (res && res.success) {
        if (window.showToast) window.showToast('Collection entry rejected.', 'info');
        setRejectingItem(null);
        setRejectionReason('');
        loadRecent();
      } else {
        if (window.showToast) window.showToast(res.error || 'Failed to reject', 'error');
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Error rejecting entry', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmResubmit = async () => {
    const amt = parseFloat(resubmitAmount);
    if (isNaN(amt) || amt < 0) {
      if (window.showToast) window.showToast('Please enter a valid amount.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const res = await api.put(`/api/collections/${resubmittingItem._id}/resubmit`, {
        amount: amt,
        notes: resubmitNotes
      });
      if (res && res.success) {
        if (window.showToast) window.showToast('Corrected collection resubmitted for approval! ✓', 'success');
        setResubmittingItem(null);
        loadRecent();
      } else {
        if (window.showToast) window.showToast(res.error || 'Failed to resubmit', 'error');
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Error resubmitting collection', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    loadAreas();
    loadRecent();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      if (window.showToast) window.showToast('Please enter a valid collection amount.', 'error');
      return;
    }

    setLoading(true);

    try {
      const clientId = generateClientId();
      const entryData = {
        clientId,
        amount: amt,
        areaId: areaId || null,
        date,
        notes: notes.trim()
      };

      if (navigator.onLine) {
        await api.post('/api/collections', entryData);
        if (window.showToast) window.showToast('Collection recorded successfully! ✓', 'success');
      } else {
        await db.addPending('pendingCollections', entryData);
        await refreshPendingCount();
        if (window.showToast) window.showToast('Offline: Collection saved locally. ⚡', 'info');
      }

      // If user enabled thank-you message, open WhatsApp link
      if (sendThankYou && donorPhone) {
        const cleanPhone = donorPhone.replace(/[^0-9]/g, '');
        const message = `Assalamu Alaikum${donorName ? ' ' + donorName : ''},\n\nThank you for contributing ${formatCurrency(amt)} towards Markazul Hidayathil Islamiyya Calendar Campaign.\nMay Allah accept and reward your noble deed.`;
        const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}&text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
      }

      setAmount('');
      setNotes('');
      setSendThankYou(false);
      setDonorPhone('');
      setDonorName('');
      loadRecent();
    } catch (err) {
      console.warn('Error recording collection, saving offline:', err);
      const clientId = generateClientId();
      await db.addPending('pendingCollections', {
        clientId,
        amount: amt,
        areaId: areaId || null,
        date,
        notes: notes.trim()
      });
      await refreshPendingCount();
      if (window.showToast) window.showToast('Saved offline. Will sync automatically.', 'warning');
    } finally {
      setLoading(false);
    }
  };

  const todayTotal = recentEntries
    .filter((e) => e.date && e.date.startsWith(date))
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  return html`
    <div class="page">
      <!-- Collection Entry Form -->
      <div class="card">
        <div class="card-title">Record Money Collection</div>
        <form onSubmit=${handleSubmit}>
          <!-- Amount -->
          <div class="form-group">
            <label class="form-label">Collection Amount (₹)</label>
            <input
              type="tel"
              pattern="[0-9]*"
              class="form-input"
              placeholder="e.g. 500"
              value=${amount}
              onInput=${(e) => setAmount(e.target.value)}
              required
              style="font-size: 24px; font-weight: 700; color: #059669;"
            />
          </div>

          <!-- Area -->
          <div class="form-group">
            <label class="form-label">Area (Optional)</label>
            <select
              class="form-input"
              value=${areaId}
              onChange=${(e) => setAreaId(e.target.value)}
            >
              <option value="">Select an area</option>
              ${areas.map(
                (a) => html`<option key=${a._id} value=${a._id}>${a.name}</option>`
              )}
            </select>
          </div>

          <!-- Date -->
          <div class="form-group">
            <label class="form-label">Date</label>
            <input
              type="date"
              class="form-input"
              value=${date}
              onInput=${(e) => setDate(e.target.value)}
              required
            />
          </div>

          <!-- Notes -->
          <div class="form-group">
            <label class="form-label">Notes / Donor Name (Optional)</label>
            <input
              type="text"
              class="form-input"
              placeholder="e.g. Ibrahim Haji, shop collection"
              value=${notes}
              onInput=${(e) => setNotes(e.target.value)}
            />
          </div>

          <!-- Optional Thank-You WhatsApp Message Switch -->
          <div style="background: var(--bg); padding: 12px; border-radius: var(--radius); margin-bottom: 16px; border: 1px solid var(--border);">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; font-weight: 600; color: var(--text);">
              <input
                type="checkbox"
                checked=${sendThankYou}
                onChange=${(e) => setSendThankYou(e.target.checked)}
                style="width: 18px; height: 18px;"
              />
              <span>Send WhatsApp Thank-You Note</span>
            </label>

            ${sendThankYou
              ? html`
                  <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
                    <input
                      type="text"
                      class="form-input"
                      placeholder="Donor Name"
                      value=${donorName}
                      onInput=${(e) => setDonorName(e.target.value)}
                    />
                    <input
                      type="tel"
                      class="form-input"
                      placeholder="WhatsApp Mobile Number"
                      value=${donorPhone}
                      onInput=${(e) => setDonorPhone(e.target.value)}
                    />
                    <p style="font-size: 11px; color: var(--text-secondary); margin: 0;">
                      Opens WhatsApp message for you to manually review and send.
                    </p>
                  </div>
                `
              : ''}
          </div>

          <button
            type="submit"
            class="btn btn-success btn-full"
            disabled=${loading}
          >
            ${loading ? 'Recording...' : 'Save Collection ✓'}
          </button>
        </form>
      </div>

      <!-- Recent Records & Approvals -->
      ${recentEntries.length > 0
        ? html`
            <div class="card">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div class="card-title" style="margin-bottom: 0;">Recent Collections & Approvals</div>
                <button
                  type="button"
                  onClick=${loadRecent}
                  style="background: none; border: none; color: var(--primary); font-size: 13px; font-weight: 600; cursor: pointer;"
                >
                  🔄 Refresh
                </button>
              </div>

              ${recentEntries.map((col) => {
                const status = col.approvalStatus || col.status || 'pending';
                const isApproved = status === 'approved' || status === 'active';
                const isPending = status === 'pending';
                const isRejected = status === 'rejected';

                return html`
                  <div
                    class="list-item"
                    key=${col._id}
                    style="display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: 12px; border-bottom: 1px solid #f1f5f9;"
                  >
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                      <div class="list-content" style="flex: 1;">
                        <div class="list-title" style="font-weight: 700; font-size: 15px;">
                          ${col.areaId ? (col.areaId.name || col.areaId) : (col.notes || 'Collection')}
                          ${col.memberId && col.memberId.fullName ? html`<span style="font-weight: 400; font-size: 13px; color: var(--text-light);"> • ${col.memberId.fullName}</span>` : ''}
                        </div>
                        <div class="list-subtitle" style="font-size: 12px; color: var(--text-light); margin-top: 2px;">
                          ${formatDate(col.date)} ${col.notes ? `• ${col.notes}` : ''}
                        </div>

                        ${isRejected && col.rejectionReason
                          ? html`
                              <div
                                style="margin-top: 6px; padding: 6px 10px; background: #fef2f2; border-left: 3px solid #ef4444; border-radius: 4px; font-size: 12px; color: #991b1b;"
                              >
                                <b>Rejection Reason:</b> ${col.rejectionReason}
                              </div>
                            `
                          : ''}
                      </div>

                      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        <div style="font-weight: 700; color: #059669; font-size: 15px;">
                          ${formatCurrency(col.amount)}
                        </div>

                        <!-- Status Badge -->
                        ${isApproved
                          ? html`<span style="font-size: 11px; font-weight: 700; color: #065f46; background: #d1fae5; padding: 2px 7px; border-radius: 10px;">✓ Approved</span>`
                          : isPending
                          ? html`<span style="font-size: 11px; font-weight: 700; color: #92400e; background: #fef3c7; padding: 2px 7px; border-radius: 10px;">⏳ Pending</span>`
                          : html`<span style="font-size: 11px; font-weight: 700; color: #991b1b; background: #fee2e2; padding: 2px 7px; border-radius: 10px;">✕ Rejected</span>`}
                      </div>
                    </div>

                    <!-- Review Actions for Leaders / Admins -->
                    ${canReview && isPending
                      ? html`
                          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; padding-top: 6px; border-top: 1px dashed #e2e8f0;">
                            <button
                              type="button"
                              onClick=${() => handleApprove(col._id)}
                              disabled=${actionLoading}
                              style="background: #10b981; color: white; border: none; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;"
                            >
                              ✓ Approve
                            </button>
                            <button
                              type="button"
                              onClick=${() => {
                                setRejectingItem(col);
                                setRejectionReason('');
                              }}
                              disabled=${actionLoading}
                              style="background: #ef4444; color: white; border: none; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;"
                            >
                              ✕ Reject
                            </button>
                          </div>
                        `
                      : ''}

                    <!-- Resubmit Action for Rejected Entries -->
                    ${isRejected
                      ? html`
                          <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
                            <button
                              type="button"
                              onClick=${() => {
                                setResubmittingItem(col);
                                setResubmitAmount(String(col.amount));
                                setResubmitNotes(col.notes || '');
                              }}
                              style="background: var(--primary); color: white; border: none; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;"
                            >
                              ✏️ Correct & Resubmit
                            </button>
                          </div>
                        `
                      : ''}
                  </div>
                `;
              })}
            </div>
          `
        : ''}

      <!-- Rejection Modal -->
      ${rejectingItem
        ? html`
            <div class="modal-overlay" onClick=${() => setRejectingItem(null)}>
              <div class="modal" onClick=${(e) => e.stopPropagation()} style="max-width: 400px; padding: 20px;">
                <h3 style="margin-top: 0; font-size: 16px; font-weight: 700;">Reject Collection Entry</h3>
                <p style="font-size: 13px; color: var(--text-light); margin-bottom: 12px;">
                  Provide a mandatory reason for rejecting this collection entry (${formatCurrency(rejectingItem.amount)}). The member will be able to correct and resubmit.
                </p>
                <div class="form-group">
                  <label class="form-label">Rejection Reason</label>
                  <textarea
                    class="form-input"
                    rows="3"
                    placeholder="e.g. Discrepancy with cash received, wrong donor name..."
                    value=${rejectionReason}
                    onInput=${(e) => setRejectionReason(e.target.value)}
                    required
                  ></textarea>
                </div>
                <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;">
                  <button
                    type="button"
                    class="btn btn-secondary"
                    onClick=${() => setRejectingItem(null)}
                    disabled=${actionLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn"
                    style="background: #ef4444; color: white;"
                    onClick=${handleConfirmReject}
                    disabled=${actionLoading}
                  >
                    ${actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                  </button>
                </div>
              </div>
            </div>
          `
        : ''}

      <!-- Resubmit Modal -->
      ${resubmittingItem
        ? html`
            <div class="modal-overlay" onClick=${() => setResubmittingItem(null)}>
              <div class="modal" onClick=${(e) => e.stopPropagation()} style="max-width: 400px; padding: 20px;">
                <h3 style="margin-top: 0; font-size: 16px; font-weight: 700;">Correct & Resubmit Collection</h3>
                <p style="font-size: 13px; color: var(--text-light); margin-bottom: 12px;">
                  Update the amount or details as requested and resubmit for approval.
                </p>
                <div class="form-group">
                  <label class="form-label">Corrected Amount (₹)</label>
                  <input
                    type="number"
                    step="any"
                    class="form-input"
                    value=${resubmitAmount}
                    onInput=${(e) => setResubmitAmount(e.target.value)}
                    required
                    min="0"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Correction Notes</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="Explanation of correction..."
                    value=${resubmitNotes}
                    onInput=${(e) => setResubmitNotes(e.target.value)}
                  />
                </div>
                <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;">
                  <button
                    type="button"
                    class="btn btn-secondary"
                    onClick=${() => setResubmittingItem(null)}
                    disabled=${actionLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn btn-success"
                    onClick=${handleConfirmResubmit}
                    disabled=${actionLoading}
                  >
                    ${actionLoading ? 'Resubmitting...' : 'Resubmit Collection ✓'}
                  </button>
                </div>
              </div>
            </div>
          `
        : ''}
    </div>
  `;
}
