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

  // Team Overall Collection Mode State (For Leader & Admin)
  const [teamInfo, setTeamInfo] = useState(null);
  const [allTeams, setAllTeams] = useState([]);
  const [selectedAdminTeamId, setSelectedAdminTeamId] = useState('');
  const [overallEnabled, setOverallEnabled] = useState(false);
  const [overallAmount, setOverallAmount] = useState('');
  const [overallNotes, setOverallNotes] = useState('');
  const [savingOverall, setSavingOverall] = useState(false);

  const loadAreas = async () => {
    try {
      const res = await api.get('/api/areas');
      if (res && res.success && res.data) setAreas(res.data);
    } catch (err) {
      console.warn('Could not fetch areas:', err);
    }
  };

  const loadTeamInfo = async () => {
    try {
      const res = await api.get('/api/teams');
      if (res && res.success && res.data) {
        setAllTeams(res.data);
        const myTeamId = user && user.teamId ? (user.teamId._id || user.teamId) : null;
        const currentTargetId = myTeamId || selectedAdminTeamId || (res.data[0] ? res.data[0]._id : null);
        const target = res.data.find((t) => t._id === currentTargetId);
        if (target) {
          setTeamInfo(target);
          setOverallEnabled(Boolean(target.leaderEntersOverallCollection));
          setOverallAmount(target.overallCollectedAmount ? String(target.overallCollectedAmount) : '');
          setOverallNotes(target.overallCollectionNotes || '');
        }
      }
    } catch (err) {
      console.warn('Could not fetch teams:', err);
    }
  };

  const handleSelectAdminTeam = (tId) => {
    setSelectedAdminTeamId(tId);
    const target = allTeams.find((t) => t._id === tId);
    if (target) {
      setTeamInfo(target);
      setOverallEnabled(Boolean(target.leaderEntersOverallCollection));
      setOverallAmount(target.overallCollectedAmount ? String(target.overallCollectedAmount) : '');
      setOverallNotes(target.overallCollectionNotes || '');
    }
  };

  const handleToggleOverallMode = async (targetEnabled) => {
    const targetTeamId = teamInfo?._id || (user.teamId ? (user.teamId._id || user.teamId) : null);
    if (!targetTeamId) {
      if (window.showToast) window.showToast('No team selected.', 'error');
      return;
    }

    setSavingOverall(true);
    try {
      const res = await api.put(`/api/teams/${targetTeamId}/overall-collection`, {
        enabled: targetEnabled,
        overallCollectedAmount: overallAmount ? parseFloat(overallAmount) : 0,
        notes: overallNotes.trim()
      });
      if (res && res.success) {
        setOverallEnabled(targetEnabled);
        if (window.showToast) window.showToast(res.message || 'Overall collection mode updated! ✓', 'success');
        loadTeamInfo();
        loadRecent();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to update overall mode.', 'error');
    } finally {
      setSavingOverall(false);
    }
  };

  const handleSaveOverallAmount = async (e) => {
    if (e) e.preventDefault();
    const targetTeamId = teamInfo?._id || (user.teamId ? (user.teamId._id || user.teamId) : null);
    if (!targetTeamId) return;

    const amt = parseFloat(overallAmount);
    if (isNaN(amt) || amt < 0) {
      if (window.showToast) window.showToast('Please enter a valid overall amount.', 'error');
      return;
    }

    setSavingOverall(true);
    try {
      const res = await api.put(`/api/teams/${targetTeamId}/overall-collection`, {
        enabled: true,
        overallCollectedAmount: amt,
        notes: overallNotes.trim()
      });
      if (res && res.success) {
        setOverallEnabled(true);
        if (window.showToast) window.showToast(`Team overall collection saved: ${formatCurrency(amt)}! ✓`, 'success');
        loadTeamInfo();
        loadRecent();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to save overall amount.', 'error');
    } finally {
      setSavingOverall(false);
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
    loadTeamInfo();
    loadRecent();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const isLocked = user && user.role === 'team_member' && teamInfo && teamInfo.leaderEntersOverallCollection;
    if (isLocked) {
      if (window.showToast) window.showToast('Team Leader has enabled Overall Collection Mode. Member self-entry is locked.', 'error');
      return;
    }

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

  const isLeader = user && user.role === 'team_leader';
  const isAdmin = user && ['super_admin', 'usthad'].includes(user.role);
  const isMemberLocked = user && user.role === 'team_member' && teamInfo && teamInfo.leaderEntersOverallCollection;

  return html`
    <div class="page">
      <!-- TEAM LEADER / ADMIN OVERALL COLLECTION MODE TOGGLE -->
      ${isLeader || isAdmin ? html`
        <div class="card" style="border-top: 4px solid ${overallEnabled ? '#10b981' : '#94a3b8'}; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div>
              <div style="font-size: 16px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                <span>⚡ Team Overall Collection Mode</span>
                <span class="badge ${overallEnabled ? 'badge-success' : 'badge-neutral'}" style="font-size: 11px;">
                  ${overallEnabled ? 'ON (Member Entry Locked)' : 'OFF (Member Entry Unlocked)'}
                </span>
              </div>
              <p style="font-size: 12px; color: var(--text-secondary); margin: 3px 0 0;">
                ${isLeader
                  ? `Manage lump-sum overall collection for ${teamInfo ? teamInfo.name : 'your team'}. When ON, members cannot self-enter collections.`
                  : 'Manage lump-sum overall collection mode for teams. Locks individual member self-entry.'}
              </p>
            </div>
          </div>

          ${isAdmin && allTeams.length > 0 ? html`
            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label" style="font-size: 12px;">Select Team</label>
              <select
                class="form-input"
                style="font-size: 13px;"
                value=${teamInfo ? teamInfo._id : ''}
                onChange=${(e) => handleSelectAdminTeam(e.target.value)}
              >
                ${allTeams.map(
                  (t) => html`<option key=${t._id} value=${t._id}>
                    ${t.name} ${t.leaderEntersOverallCollection ? '🟢 (Mode: ON)' : ''}
                  </option>`
                )}
              </select>
            </div>
          ` : ''}

          <!-- ON / OFF Toggle Bar -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: ${overallEnabled ? '#ecfdf5' : '#f8fafc'}; border: 1.5px solid ${overallEnabled ? '#a7f3d0' : '#e2e8f0'}; border-radius: 12px; margin-bottom: 12px;">
            <div>
              <div style="font-weight: 700; font-size: 13px; color: ${overallEnabled ? '#065f46' : '#334155'};">
                ${overallEnabled ? '🟢 Overall Collection Mode: ON' : '⚪ Overall Collection Mode: OFF'}
              </div>
              <div style="font-size: 11px; color: ${overallEnabled ? '#047857' : '#64748b'}; margin-top: 2px;">
                ${overallEnabled
                  ? '🔒 Member self-entry is LOCKED. Team Leader manages overall lump sum.'
                  : '🔓 Member self-entry is UNLOCKED. Team members record individual entries.'}
              </div>
            </div>

            <button
              type="button"
              class="btn ${overallEnabled ? 'btn-danger' : 'btn-success'} btn-sm"
              style="font-weight: 700; min-width: 95px;"
              onClick=${() => handleToggleOverallMode(!overallEnabled)}
              disabled=${savingOverall}
            >
              ${savingOverall ? 'Saving...' : overallEnabled ? 'Turn OFF' : 'Turn ON'}
            </button>
          </div>

          <!-- Overall Amount Input Form (Visible when mode is ON) -->
          ${overallEnabled ? html`
            <form onSubmit=${handleSaveOverallAmount} style="background: #ffffff; border: 1.5px dashed #a7f3d0; border-radius: 10px; padding: 12px;">
              <div class="form-group" style="margin-bottom: 10px;">
                <label class="form-label" style="font-size: 12px; color: #065f46; font-weight: 700;">
                  Overall Total Amount Collected (₹) *
                </label>
                <div style="display: flex; gap: 8px;">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    class="form-input"
                    placeholder="e.g. 50000"
                    value=${overallAmount}
                    onInput=${(e) => setOverallAmount(e.target.value)}
                    style="font-size: 20px; font-weight: 800; color: #059669; flex: 1;"
                    required
                  />
                  <button
                    type="submit"
                    class="btn btn-primary"
                    style="font-weight: 700; white-space: nowrap;"
                    disabled=${savingOverall}
                  >
                    ${savingOverall ? 'Saving...' : 'Save Total ✓'}
                  </button>
                </div>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" style="font-size: 11px; color: #64748b;">Notes / Remarks (Optional)</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="e.g. Total collected from shops and sponsors in lump-sum"
                  value=${overallNotes}
                  onInput=${(e) => setOverallNotes(e.target.value)}
                  style="font-size: 12px;"
                />
              </div>

              ${teamInfo && teamInfo.overallCollectedAmount ? html`
                <div style="margin-top: 8px; font-size: 11px; color: #047857; font-weight: 600; display: flex; justify-content: space-between;">
                  <span>Currently Saved: <b>${formatCurrency(teamInfo.overallCollectedAmount)}</b></span>
                  ${teamInfo.overallCollectionUpdatedAt ? html`
                    <span style="color: #64748b;">Updated: ${formatDate(teamInfo.overallCollectionUpdatedAt)}</span>
                  ` : ''}
                </div>
              ` : ''}
            </form>
          ` : ''}
        </div>
      ` : ''}

      <!-- MEMBER LOCKED ALERT BANNER -->
      ${isMemberLocked ? html`
        <div class="card" style="background: #fffbeb; border: 1.5px solid #fde68a; border-left: 5px solid #f59e0b; padding: 14px 16px; margin-bottom: 16px;">
          <div style="display: flex; align-items: flex-start; gap: 12px;">
            <span style="font-size: 26px; line-height: 1;">🔒</span>
            <div>
              <div style="font-size: 15px; font-weight: 800; color: #92400e; margin-bottom: 4px;">
                Member Collection Entry Locked
              </div>
              <p style="font-size: 13px; color: #78350f; margin: 0 0 6px; line-height: 1.4;">
                Your Team Leader has enabled <b>Overall Collection Mode</b> for <b>${teamInfo ? teamInfo.name : 'your team'}</b>.
                The overall team collection is being managed directly as a lump-sum (Total: <b>${formatCurrency((teamInfo && teamInfo.overallCollectedAmount) || 0)}</b>).
              </p>
              <div style="font-size: 12px; color: #b45309; font-weight: 600;">
                ⛔ Individual member collection entries are temporarily turned off.
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Collection Entry Form -->
      <div class="card" style="opacity: ${isMemberLocked ? '0.6' : '1'};">
        <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Record Money Collection</span>
          ${isMemberLocked ? html`<span class="badge badge-warning" style="font-size: 11px;">🔒 Locked</span>` : ''}
        </div>
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
              disabled=${isMemberLocked}
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
              disabled=${isMemberLocked}
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
              disabled=${isMemberLocked}
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
              disabled=${isMemberLocked}
            />
          </div>

          <!-- Optional Thank-You WhatsApp Message Switch -->
          <div style="background: var(--bg); padding: 12px; border-radius: var(--radius); margin-bottom: 16px; border: 1px solid var(--border);">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; font-weight: 600; color: var(--text);">
              <input
                type="checkbox"
                checked=${sendThankYou}
                onChange=${(e) => setSendThankYou(e.target.checked)}
                disabled=${isMemberLocked}
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
                      disabled=${isMemberLocked}
                    />
                    <input
                      type="tel"
                      class="form-input"
                      placeholder="WhatsApp Mobile Number"
                      value=${donorPhone}
                      onInput=${(e) => setDonorPhone(e.target.value)}
                      disabled=${isMemberLocked}
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
            class="btn ${isMemberLocked ? 'btn-secondary' : 'btn-success'} btn-full"
            disabled=${loading || isMemberLocked}
          >
            ${isMemberLocked ? '🔒 Member Entry Locked (Overall Mode Active)' : loading ? 'Recording...' : 'Save Collection ✓'}
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
