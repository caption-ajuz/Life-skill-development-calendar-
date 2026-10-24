import api from '../services/api.js';
import db from '../services/db.js';
import { generateClientId, refreshPendingCount, syncStatus } from '../services/sync.js';
import { formatDate } from '../utils/format.js';
import { currentUser } from '../store/auth.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Distribution() {
  const user = currentUser.value;
  const canReview = user && ['super_admin', 'usthad', 'team_leader'].includes(user.role);

  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState('');
  const [newAreaName, setNewAreaName] = useState('');
  const [showNewArea, setShowNewArea] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentEntries, setRecentEntries] = useState([]);

  // Approval review modal state
  const [rejectingItem, setRejectingItem] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Resubmit modal state
  const [resubmittingItem, setResubmittingItem] = useState(null);
  const [resubmitQty, setResubmitQty] = useState('');
  const [resubmitNotes, setResubmitNotes] = useState('');

  const loadAreas = async () => {
    try {
      const res = await api.get('/api/areas');
      if (res && res.success && res.data) {
        setAreas(res.data);
      }
    } catch (err) {
      console.warn('Could not fetch areas from network:', err);
    }
  };

  const loadRecent = async () => {
    try {
      const res = await api.get('/api/distributions', { limit: 20 });
      if (res && res.success && res.data) {
        setRecentEntries(res.data.distributions || []);
      }
    } catch (err) {
      console.warn('Could not fetch recent distributions:', err);
    }
  };

  const handleApprove = async (id) => {
    setActionLoading(true);
    try {
      const res = await api.put(`/api/distributions/${id}/approve`, {});
      if (res && res.success) {
        if (window.showToast) window.showToast('Distribution entry approved! ✓', 'success');
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
      const res = await api.put(`/api/distributions/${rejectingItem._id}/reject`, { reason: rejectionReason.trim() });
      if (res && res.success) {
        if (window.showToast) window.showToast('Distribution entry rejected.', 'info');
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
    const qty = parseInt(resubmitQty, 10);
    if (!qty || qty < 1) {
      if (window.showToast) window.showToast('Quantity must be at least 1.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const res = await api.put(`/api/distributions/${resubmittingItem._id}/resubmit`, {
        quantity: qty,
        notes: resubmitNotes
      });
      if (res && res.success) {
        if (window.showToast) window.showToast('Corrected entry resubmitted for approval! ✓', 'success');
        setResubmittingItem(null);
        loadRecent();
      } else {
        if (window.showToast) window.showToast(res.error || 'Failed to resubmit', 'error');
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Error resubmitting entry', 'error');
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

    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) {
      if (window.showToast) window.showToast('Please enter a valid quantity of calendars.', 'error');
      return;
    }

    setLoading(true);

    try {
      let finalAreaId = areaId;

      // Handle new area creation if specified
      if (showNewArea && newAreaName.trim()) {
        if (navigator.onLine) {
          const areaRes = await api.post('/api/areas', { name: newAreaName.trim() });
          if (areaRes && areaRes.data) {
            finalAreaId = areaRes.data._id;
            setAreas((prev) => [...prev, areaRes.data]);
          }
        } else {
          // Save area offline
          const tempAreaClientId = generateClientId();
          await db.addPending('pendingAreas', {
            clientId: tempAreaClientId,
            name: newAreaName.trim(),
            district: 'Palakkad'
          });
        }
      }

      const clientId = generateClientId();
      const entryData = {
        clientId,
        quantity: qty,
        areaId: finalAreaId || null,
        date,
        notes: notes.trim()
      };

      if (navigator.onLine) {
        await api.post('/api/distributions', entryData);
        if (window.showToast) window.showToast('Distribution recorded successfully! ✓', 'success');
      } else {
        // Save to IndexedDB queue
        await db.addPending('pendingDistributions', entryData);
        await refreshPendingCount();
        if (window.showToast) window.showToast('Offline: Entry saved locally and queued for sync. ⚡', 'info');
      }

      // Reset form
      setQuantity('1');
      setNotes('');
      setShowNewArea(false);
      setNewAreaName('');
      loadRecent();
    } catch (err) {
      // In case of unexpected network failure during POST
      console.warn('POST failed, fallback to offline storage:', err);
      const clientId = generateClientId();
      await db.addPending('pendingDistributions', {
        clientId,
        quantity: qty,
        areaId: areaId || null,
        date,
        notes: notes.trim()
      });
      await refreshPendingCount();
      if (window.showToast) window.showToast('Network issue: Entry saved offline and queued.', 'warning');
    } finally {
      setLoading(false);
    }
  };

  return html`
    <div class="page">
      <div class="card">
        <div class="card-title">Record Calendar Distribution</div>
        <form onSubmit=${handleSubmit}>
          <!-- Area Selection -->
          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label class="form-label" style="margin-bottom: 0;">Area / Locality</label>
              <button
                type="button"
                onClick=${() => setShowNewArea(!showNewArea)}
                style="background: none; border: none; color: var(--primary); font-size: 13px; font-weight: 600; cursor: pointer;"
              >
                ${showNewArea ? 'Select Existing Area' : '+ Add New Area'}
              </button>
            </div>

            ${showNewArea
              ? html`
                  <input
                    type="text"
                    class="form-input"
                    placeholder="Enter locality / village name"
                    value=${newAreaName}
                    onInput=${(e) => setNewAreaName(e.target.value)}
                    required
                  />
                `
              : html`
                  <select
                    class="form-input"
                    value=${areaId}
                    onChange=${(e) => setAreaId(e.target.value)}
                  >
                    <option value="">Select an area (optional)</option>
                    ${areas.map(
                      (a) => html`<option key=${a._id} value=${a._id}>${a.name} (${a.district || 'Palakkad'})</option>`
                    )}
                  </select>
                `}
          </div>

          <!-- Quantity -->
          <div class="form-group">
            <label class="form-label">Quantity (Calendars)</label>
            <input
              type="tel"
              pattern="[0-9]*"
              class="form-input"
              value=${quantity}
              onInput=${(e) => setQuantity(e.target.value)}
              required
              min="1"
              style="font-size: 20px; font-weight: 700; color: var(--primary);"
            />
          </div>

          <!-- Date -->
          <div class="form-group">
            <label class="form-label">Distribution Date</label>
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
            <label class="form-label">Notes (Optional)</label>
            <input
              type="text"
              class="form-input"
              placeholder="e.g. Mosque committee, shops, house visit"
              value=${notes}
              onInput=${(e) => setNotes(e.target.value)}
            />
          </div>

          <button
            type="submit"
            class="btn btn-primary"
            disabled=${loading}
          >
            ${loading ? 'Saving...' : 'Save Distribution ✓'}
          </button>
        </form>
      </div>

      <!-- Recent Records & Approval Status -->
      ${recentEntries.length > 0
        ? html`
            <div class="card">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div class="card-title" style="margin-bottom: 0;">Recent Records & Approvals</div>
                <button
                  type="button"
                  onClick=${loadRecent}
                  style="background: none; border: none; color: var(--primary); font-size: 13px; font-weight: 600; cursor: pointer;"
                >
                  🔄 Refresh
                </button>
              </div>

              ${recentEntries.map((item) => {
                const status = item.approvalStatus || item.status || 'pending';
                const isApproved = status === 'approved' || status === 'active';
                const isPending = status === 'pending';
                const isRejected = status === 'rejected';

                return html`
                  <div
                    class="list-item"
                    key=${item._id}
                    style="display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: 12px; border-bottom: 1px solid #f1f5f9;"
                  >
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                      <div class="list-content" style="flex: 1;">
                        <div class="list-title" style="font-weight: 700; font-size: 15px;">
                          ${item.areaId ? (item.areaId.name || item.areaId) : 'Area unrecorded'}
                          ${item.memberId && item.memberId.fullName ? html`<span style="font-weight: 400; font-size: 13px; color: var(--text-light);"> • ${item.memberId.fullName}</span>` : ''}
                        </div>
                        <div class="list-subtitle" style="font-size: 12px; color: var(--text-light); margin-top: 2px;">
                          ${formatDate(item.date)} • ${item.notes || 'Routine distribution'}
                        </div>

                        ${isRejected && item.rejectionReason
                          ? html`
                              <div
                                style="margin-top: 6px; padding: 6px 10px; background: #fef2f2; border-left: 3px solid #ef4444; border-radius: 4px; font-size: 12px; color: #991b1b;"
                              >
                                <b>Rejection Reason:</b> ${item.rejectionReason}
                              </div>
                            `
                          : ''}
                      </div>

                      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        <div class="badge badge-success" style="font-weight: 700; font-size: 15px;">
                          ${item.quantity} calendars
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
                              onClick=${() => handleApprove(item._id)}
                              disabled=${actionLoading}
                              style="background: #10b981; color: white; border: none; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;"
                            >
                              ✓ Approve
                            </button>
                            <button
                              type="button"
                              onClick=${() => {
                                setRejectingItem(item);
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
                                setResubmittingItem(item);
                                setResubmitQty(String(item.quantity));
                                setResubmitNotes(item.notes || '');
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
                <h3 style="margin-top: 0; font-size: 16px; font-weight: 700;">Reject Distribution Entry</h3>
                <p style="font-size: 13px; color: var(--text-light); margin-bottom: 12px;">
                  Provide a mandatory reason for rejecting this entry (${rejectingItem.quantity} calendars). The member will be able to correct and resubmit.
                </p>
                <div class="form-group">
                  <label class="form-label">Rejection Reason</label>
                  <textarea
                    class="form-input"
                    rows="3"
                    placeholder="e.g. Quantity mismatch with physical count, wrong area specified..."
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

      <!-- Resubmit / Correction Modal -->
      ${resubmittingItem
        ? html`
            <div class="modal-overlay" onClick=${() => setResubmittingItem(null)}>
              <div class="modal" onClick=${(e) => e.stopPropagation()} style="max-width: 400px; padding: 20px;">
                <h3 style="margin-top: 0; font-size: 16px; font-weight: 700;">Correct & Resubmit Entry</h3>
                <p style="font-size: 13px; color: var(--text-light); margin-bottom: 12px;">
                  Update the values as requested and resubmit for review.
                </p>
                <div class="form-group">
                  <label class="form-label">Corrected Quantity (Calendars)</label>
                  <input
                    type="tel"
                    pattern="[0-9]*"
                    class="form-input"
                    value=${resubmitQty}
                    onInput=${(e) => setResubmitQty(e.target.value)}
                    required
                    min="1"
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
                    class="btn btn-primary"
                    onClick=${handleConfirmResubmit}
                    disabled=${actionLoading}
                  >
                    ${actionLoading ? 'Resubmitting...' : 'Resubmit Entry ✓'}
                  </button>
                </div>
              </div>
            </div>
          `
        : ''}
    </div>
  `;
}
