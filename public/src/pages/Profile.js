import api from '../services/api.js';
import { currentUser, logout } from '../store/auth.js';
import { formatCurrency, formatDate, formatNumber } from '../utils/format.js';
import { compressImage } from '../utils/image.js';
import { pwaState, promptInstall } from '../services/pwa.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Profile() {
  const loggedInUser = currentUser.value;

  // Extract ID from URL hash query if present: #/profile?id=...
  const getQueryId = () => {
    const hash = window.location.hash || '';
    const queryPart = hash.split('?')[1];
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      return params.get('id');
    }
    return null;
  };

  const targetUserId = getQueryId() || (loggedInUser ? loggedInUser._id : null);
  const isSelf = loggedInUser && targetUserId === loggedInUser._id;

  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'distributions' | 'collections' | 'transfers' | 'expenses' | 'settings'

  // Modal: Record Income / Collection
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [incomeType, setIncomeType] = useState('calendar_sale');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeNotes, setIncomeNotes] = useState('');
  const [incomeDate, setIncomeDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [savingIncome, setSavingIncome] = useState(false);

  // Modal: Record Expense
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expCategory, setExpCategory] = useState('transport');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [savingExpense, setSavingExpense] = useState(false);

  // Profile Edit fields (Self)
  const [phone, setPhone] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  const [newPin, setNewPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  // PWA & Logout states
  const [pwa, setPwa] = useState(() => pwaState.value);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    return pwaState.subscribe ? pwaState.subscribe(setPwa) : undefined;
  }, []);

  const handlePwaInstall = async () => {
    const res = await promptInstall();
    if (res && res.outcome === 'ios_guide') {
      setShowIOSModal(true);
    }
  };

  const handleConfirmLogout = async () => {
    setShowLogoutConfirm(false);
    if (window.showToast) window.showToast('Logged out successfully', 'info');
    await logout();
  };

  const loadProfile = async () => {
    if (!targetUserId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/users/${targetUserId}/profile`);
      if (res && res.success && res.data) {
        setProfileData(res.data);
        if (res.data.user) {
          setPhone(res.data.user.phone || '');
        }
      }
    } catch (err) {
      console.warn('Failed to load profile:', err);
      if (window.showToast) window.showToast('Failed to load user profile.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [targetUserId]);

  const handleRecordIncome = async (e) => {
    e.preventDefault();
    const amt = parseFloat(incomeAmount);
    if (isNaN(amt) || amt <= 0) {
      if (window.showToast) window.showToast('Please enter a valid amount.', 'error');
      return;
    }
    setSavingIncome(true);
    try {
      const payload = {
        amount: amt,
        incomeType,
        date: incomeDate,
        notes: incomeNotes.trim()
      };
      if (!isSelf && targetUserId) {
        payload.memberId = targetUserId;
      }
      const res = await api.post('/api/collections', payload);
      if (res && res.success) {
        if (window.showToast) window.showToast('Income entry recorded successfully! ✓', 'success');
        setShowIncomeModal(false);
        setIncomeAmount('');
        setIncomeNotes('');
        loadProfile();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to record entry.', 'error');
    } finally {
      setSavingIncome(false);
    }
  };

  const handleRecordExpense = async (e) => {
    e.preventDefault();
    const amt = parseFloat(expAmount);
    if (isNaN(amt) || amt <= 0 || !expDesc.trim()) {
      if (window.showToast) window.showToast('Please enter description and a valid amount.', 'error');
      return;
    }
    setSavingExpense(true);
    try {
      const payload = {
        category: expCategory,
        description: expDesc.trim(),
        amount: amt,
        date: expDate,
        memberId: targetUserId
      };
      const res = await api.post('/api/expenses', payload);
      if (res && res.success) {
        if (window.showToast) window.showToast('Expense recorded successfully! ✓', 'success');
        setShowExpenseModal(false);
        setExpAmount('');
        setExpDesc('');
        loadProfile();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to record expense.', 'error');
    } finally {
      setSavingExpense(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setPhotoUploading(true);
    try {
      const compressedBlob = await compressImage(file, 200, 0.7);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result;
        try {
          const res = await api.post('/api/uploads/profile-photo', {
            photoData: base64Data,
            targetUserId: targetUserId
          });
          if (res && res.success) {
            if (isSelf) {
              currentUser.value = { ...currentUser.value, profilePhoto: res.photoUrl };
            }
            if (window.showToast) window.showToast('Profile photo updated in Cloudinary! ✓', 'success');
            loadProfile();
          }
        } catch (postErr) {
          if (window.showToast) window.showToast(postErr.message || 'Failed to upload photo.', 'error');
        } finally {
          setPhotoUploading(false);
        }
      };
      reader.readAsDataURL(compressedBlob);
    } catch (err) {
      setPhotoUploading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPass !== confirmPass) {
      if (window.showToast) window.showToast('Passwords do not match.', 'error');
      return;
    }
    if (newPass.length < 6) {
      if (window.showToast) window.showToast('New password must be at least 6 characters.', 'error');
      return;
    }
    setSavingPass(true);
    try {
      await api.put('/api/auth/change-password', {
        currentPassword: currPass,
        newPassword: newPass
      });
      if (window.showToast) window.showToast('Password changed successfully! ✓', 'success');
      setCurrPass('');
      setNewPass('');
      setConfirmPass('');
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to update password.', 'error');
    } finally {
      setSavingPass(false);
    }
  };

  const handleUpdatePin = async (e) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(newPin.trim())) {
      if (window.showToast) window.showToast('PIN must be 4 or 6 numeric digits.', 'error');
      return;
    }
    setSavingPin(true);
    try {
      await api.put(`/api/users/${targetUserId}/reset-pin`, {
        newPin: newPin.trim()
      });
      if (window.showToast) window.showToast('Quick PIN updated successfully! ✓', 'success');
      setNewPin('');
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to update PIN.', 'error');
    } finally {
      setSavingPin(false);
    }
  };

  if (loading) {
    return html`
      <div class="page">
        <div style="height: 140px; margin-bottom: 14px;" class="skeleton"></div>
        <div style="height: 220px;" class="skeleton"></div>
      </div>
    `;
  }

  if (!profileData || !profileData.user) {
    return html`
      <div class="page">
        <div class="empty-state">
          <p>Member profile not found or access denied.</p>
          <button class="btn btn-primary" onClick=${() => (window.location.hash = '#/members')}>
            Back to Members
          </button>
        </div>
      </div>
    `;
  }

  const u = profileData.user;
  const s = profileData.stats || {};
  const act = profileData.activity || {};

  return html`
    <div class="page">
      <!-- Breadcrumb / Back Navigation if viewing other member -->
      ${!isSelf ? html`
        <div style="margin-bottom: 10px;">
          <button
            class="btn btn-outline btn-sm"
            onClick=${() => window.history.back()}
            style="font-size: 12px; padding: 4px 10px;"
          >
            ← Back
          </button>
        </div>
      ` : ''}

      <!-- Top Profile Card -->
      <div class="card" style="border-top: 4px solid var(--primary); margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <div style="position: relative;">
            <div class="list-avatar" style="width: 64px; height: 64px; font-size: 26px; background: linear-gradient(135deg, #0284c7, #1d4ed8); color: white;">
              ${u.profilePhoto ? html`<img src="${u.profilePhoto}" alt="" />` : u.fullName.charAt(0)}
            </div>
            ${isSelf || (loggedInUser && (loggedInUser.role === 'super_admin' || loggedInUser.role === 'usthad' || (loggedInUser.role === 'team_leader' && loggedInUser.teamId && u.teamId && String(loggedInUser.teamId._id || loggedInUser.teamId) === String(u.teamId._id || u.teamId)))) ? html`
              <label style="position: absolute; bottom: -4px; right: -4px; background: white; border-radius: 50%; padding: 4px; box-shadow: var(--shadow-sm); cursor: pointer; border: 1px solid #e2e8f0;" title="Upload photo to Cloudinary">
                <svg style="width: 14px; height: 14px; color: var(--primary);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
                <input type="file" accept="image/*" style="display: none;" onChange=${handlePhotoUpload} disabled=${photoUploading} />
              </label>
            ` : ''}
          </div>

          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0;">${u.fullName}</h2>
              <span class="badge ${u.isActive !== false ? 'badge-success' : 'badge-error'}" style="font-size: 10px;">
                ${u.isActive !== false ? 'Active' : 'Deactivated'}
              </span>
            </div>
            <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span><b>@${u.username}</b> · <span style="text-transform: capitalize;">${u.role.replace('_', ' ')}</span></span>
              <span class="badge badge-info" style="font-size: 10px;">☁️ Cloudinary</span>
            </div>
            <div style="font-size: 12px; color: #0284c7; font-weight: 600; margin-top: 1px;">
              🏷️ ${u.teamId ? (u.teamId.name || u.teamId) : 'Central Team'}
            </div>
            ${u.phone ? html`<div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">📞 ${u.phone}</div>` : ''}
          </div>
        </div>

        <!-- Temporary password warning banner -->
        ${u.mustChangePassword ? html`
          <div style="margin-top: 12px; background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 10px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #92400e;">
            <div>
              <b>⚠️ First Login Notice:</b> This user was assigned a temporary password and must set a permanent password.
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Quick Action Buttons for Field Operations -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 14px;">
        <button
          type="button"
          class="btn btn-outline btn-sm"
          onClick=${() => (window.location.hash = '#/distribution')}
          style="display: flex; flex-direction: column; align-items: center; padding: 8px 4px; font-size: 11px; font-weight: 700;"
        >
          <span style="font-size: 16px;">📦</span>
          <span>Distribute</span>
        </button>

        <button
          type="button"
          class="btn btn-primary btn-sm"
          onClick=${() => setShowIncomeModal(true)}
          style="display: flex; flex-direction: column; align-items: center; padding: 8px 4px; font-size: 11px; font-weight: 700;"
        >
          <span style="font-size: 16px;">💰</span>
          <span>+ Income</span>
        </button>

        <button
          type="button"
          class="btn btn-outline btn-sm"
          onClick=${() => setShowExpenseModal(true)}
          style="display: flex; flex-direction: column; align-items: center; padding: 8px 4px; font-size: 11px; font-weight: 700;"
        >
          <span style="font-size: 16px;">🧾</span>
          <span>+ Expense</span>
        </button>

        <button
          type="button"
          class="btn btn-outline btn-sm"
          onClick=${() => (window.location.hash = '#/transfers')}
          style="display: flex; flex-direction: column; align-items: center; padding: 8px 4px; font-size: 11px; font-weight: 700;"
        >
          <span style="font-size: 16px;">🤝</span>
          <span>Handover</span>
        </button>
      </div>

      <!-- Key Personal Financial & Stock Metrics -->
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px;">
        <!-- Calendars Distributed & In Hand -->
        <div class="card" style="margin-bottom: 0; padding: 12px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">
            📦 Stock Status
          </div>
          <div style="font-size: 20px; font-weight: 800; color: var(--primary); margin-top: 2px;">
            ${formatNumber(s.distributedStock || 0)} <span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">/ ${formatNumber(s.allocatedStock || 0)}</span>
          </div>
          <div style="font-size: 11px; color: #059669; font-weight: 600; margin-top: 2px;">
            ${formatNumber(s.remainingStock || 0)} in hand remaining
          </div>
        </div>

        <!-- Cash in Hand (Untransferred) -->
        <div class="card" style="margin-bottom: 0; padding: 12px; background: ${(s.inHandCash || 0) > 0 ? '#f0fdf4' : '#f8fafc'}; border: 1.5px solid ${(s.inHandCash || 0) > 0 ? '#bbf7d0' : '#e2e8f0'};">
          <div style="font-size: 11px; font-weight: 700; color: #166534; text-transform: uppercase;">
            💵 Cash In Hand
          </div>
          <div style="font-size: 20px; font-weight: 800; color: #15803d; margin-top: 2px;">
            ${formatCurrency(s.inHandCash || 0)}
          </div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">
            Needs handover to Leader/Bank
          </div>
        </div>

        <!-- Collections & Other Income -->
        <div class="card" style="margin-bottom: 0; padding: 12px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">
            💰 Total Collections
          </div>
          <div style="font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 2px;">
            ${formatCurrency(s.totalCollected || 0)}
          </div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
            Sales: ${formatCurrency(s.calendarCollections || 0)} · Other: ${formatCurrency(s.otherIncome || 0)}
          </div>
        </div>

        <!-- Handover Confirmed -->
        <div class="card" style="margin-bottom: 0; padding: 12px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">
            ✅ Confirmed Handed
          </div>
          <div style="font-size: 18px; font-weight: 800; color: #0284c7; margin-top: 2px;">
            ${formatCurrency(s.confirmedTransfers || 0)}
          </div>
          <div style="font-size: 11px; color: #d97706; font-weight: 600; margin-top: 2px;">
            Pending: ${formatCurrency(s.pendingTransfers || 0)}
          </div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 12px; background: #e2e8f0; padding: 4px; border-radius: 10px;">
        <button
          type="button"
          class="btn btn-sm ${activeTab === 'summary' ? 'btn-primary' : 'btn-outline'}"
          style="flex: 1; border: none; font-size: 11px; padding: 6px 8px; white-space: nowrap;"
          onClick=${() => setActiveTab('summary')}
        >
          Activity
        </button>
        <button
          type="button"
          class="btn btn-sm ${activeTab === 'collections' ? 'btn-primary' : 'btn-outline'}"
          style="flex: 1; border: none; font-size: 11px; padding: 6px 8px; white-space: nowrap;"
          onClick=${() => setActiveTab('collections')}
        >
          Collections (${(act.collections || []).length})
        </button>
        <button
          type="button"
          class="btn btn-sm ${activeTab === 'transfers' ? 'btn-primary' : 'btn-outline'}"
          style="flex: 1; border: none; font-size: 11px; padding: 6px 8px; white-space: nowrap;"
          onClick=${() => setActiveTab('transfers')}
        >
          Handovers (${(act.transfers || []).length})
        </button>
        <button
          type="button"
          class="btn btn-sm ${activeTab === 'expenses' ? 'btn-primary' : 'btn-outline'}"
          style="flex: 1; border: none; font-size: 11px; padding: 6px 8px; white-space: nowrap;"
          onClick=${() => setActiveTab('expenses')}
        >
          Expenses (${(act.expenses || []).length})
        </button>
        ${isSelf ? html`
          <button
            type="button"
            class="btn btn-sm ${activeTab === 'settings' ? 'btn-primary' : 'btn-outline'}"
            style="flex: 1; border: none; font-size: 11px; padding: 6px 8px; white-space: nowrap;"
            onClick=${() => setActiveTab('settings')}
          >
            Security
          </button>
        ` : ''}
      </div>

      <!-- Tab Content -->
      ${activeTab === 'summary' ? html`
        <div class="card">
          <div class="card-title">Recent Activity Log</div>
          ${(!act.distributions || act.distributions.length === 0) && (!act.collections || act.collections.length === 0)
            ? html`<div class="empty-state"><p>No activity recorded yet for this member.</p></div>`
            : html`
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  ${(act.distributions || []).slice(0, 5).map((d) => html`
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9;">
                      <div>
                        <div style="font-size: 13px; font-weight: 700; color: #0f172a;">
                          📦 Distributed ${d.quantity} calendars
                        </div>
                        <div style="font-size: 11px; color: var(--text-secondary);">
                          ${formatDate(d.date)} · ${d.areaId ? (d.areaId.name || d.areaId) : 'Central Area'}
                        </div>
                      </div>
                      <span class="badge badge-info" style="font-size: 11px;">+${d.quantity}</span>
                    </div>
                  `)}

                  ${(act.collections || []).slice(0, 5).map((c) => html`
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9;">
                      <div>
                        <div style="font-size: 13px; font-weight: 700; color: #059669;">
                          💰 Collected ${formatCurrency(c.amount)}
                        </div>
                        <div style="font-size: 11px; color: var(--text-secondary);">
                          ${formatDate(c.date)} · ${c.incomeType === 'other_income' ? 'Donation / Other' : 'Calendar Sales'}
                        </div>
                      </div>
                      <span class="badge badge-success" style="font-size: 11px;">${formatCurrency(c.amount)}</span>
                    </div>
                  `)}
                </div>
              `}
        </div>
      ` : activeTab === 'collections' ? html`
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div class="card-title" style="margin-bottom: 0;">Collections & Other Income</div>
            <button class="btn btn-primary btn-sm" onClick=${() => setShowIncomeModal(true)}>+ Add Entry</button>
          </div>
          ${(!act.collections || act.collections.length === 0)
            ? html`<div class="empty-state"><p>No collection entries recorded.</p></div>`
            : html`
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  ${act.collections.map((c) => html`
                    <div key=${c._id} style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 10px;">
                      <div>
                        <div style="font-size: 14px; font-weight: 700; color: #0f172a;">
                          ${formatCurrency(c.amount)}
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                          ${formatDate(c.date)} · <span class="badge ${c.incomeType === 'other_income' ? 'badge-warning' : 'badge-info'}" style="font-size: 10px;">${c.incomeType || 'calendar_sale'}</span>
                        </div>
                        ${c.notes ? html`<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${c.notes}</div>` : ''}
                      </div>
                      <span class="badge badge-success" style="font-size: 11px;">Active</span>
                    </div>
                  `)}
                </div>
              `}
        </div>
      ` : activeTab === 'transfers' ? html`
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div class="card-title" style="margin-bottom: 0;">Money Handovers & Transfers</div>
            <button class="btn btn-primary btn-sm" onClick=${() => (window.location.hash = '#/transfers')}>+ New Handover</button>
          </div>
          ${(!act.transfers || act.transfers.length === 0)
            ? html`<div class="empty-state"><p>No money transfers recorded.</p></div>`
            : html`
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  ${act.transfers.map((t) => html`
                    <div key=${t._id} style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 10px;">
                      <div>
                        <div style="font-size: 14px; font-weight: 700; color: #0284c7;">
                          ${formatCurrency(t.amount)}
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                          ${formatDate(t.transferDate)} · Handed to: <b>${t.toDescription || 'Usthad / Bank'}</b>
                        </div>
                      </div>
                      <span class="badge ${t.status === 'confirmed' ? 'badge-success' : 'badge-warning'}" style="font-size: 11px;">
                        ${t.status === 'confirmed' ? '✓ Confirmed' : '⏳ Pending'}
                      </span>
                    </div>
                  `)}
                </div>
              `}
        </div>
      ` : activeTab === 'expenses' ? html`
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div class="card-title" style="margin-bottom: 0;">Personal / Field Expenses</div>
            <button class="btn btn-primary btn-sm" onClick=${() => setShowExpenseModal(true)}>+ Add Expense</button>
          </div>
          ${(!act.expenses || act.expenses.length === 0)
            ? html`<div class="empty-state"><p>No expenses recorded by this member.</p></div>`
            : html`
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  ${act.expenses.map((e) => html`
                    <div key=${e._id} style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 10px;">
                      <div>
                        <div style="font-size: 14px; font-weight: 700; color: #dc2626;">
                          ${formatCurrency(e.amount)}
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                          ${formatDate(e.date)} · <span style="text-transform: capitalize;">${e.category}</span>
                        </div>
                        <div style="font-size: 12px; color: #334155;">${e.description}</div>
                      </div>
                      <span class="badge badge-info" style="font-size: 11px;">Recorded</span>
                    </div>
                  `)}
                </div>
              `}
        </div>
      ` : html`
        <!-- Settings & Security Tab (Self) -->
        <div class="card">
          <div class="card-title">Update Quick PIN</div>
          <form onSubmit=${handleUpdatePin}>
            <div class="form-group">
              <label class="form-label">4-Digit PIN (for Federal Bank-style quick login)</label>
              <input
                type="text"
                maxlength="6"
                class="form-input"
                placeholder="Enter 4-digit PIN (e.g. 1234)"
                value=${newPin}
                onInput=${(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style="font-size: 20px; font-weight: 700; letter-spacing: 3px; color: #0284c7;"
                required
              />
            </div>
            <button type="submit" class="btn btn-primary btn-full" disabled=${savingPin}>
              ${savingPin ? 'Saving...' : 'Save New PIN'}
            </button>
          </form>
        </div>

        <div class="card">
          <div class="card-title">Change Password</div>
          <form onSubmit=${handleUpdatePassword}>
            <div class="form-group">
              <label class="form-label">Current Password</label>
              <input type="password" class="form-input" value=${currPass} onInput=${(e) => setCurrPass(e.target.value)} required />
            </div>
            <div class="form-group">
              <label class="form-label">New Password (min 6 characters)</label>
              <input type="password" class="form-input" value=${newPass} onInput=${(e) => setNewPass(e.target.value)} required />
            </div>
            <div class="form-group">
              <label class="form-label">Confirm New Password</label>
              <input type="password" class="form-input" value=${confirmPass} onInput=${(e) => setConfirmPass(e.target.value)} required />
            </div>
            <button type="submit" class="btn btn-secondary btn-full" disabled=${savingPass}>
              ${savingPass ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        <!-- PWA Installation Card -->
        <div class="card" style="border: 1.5px solid #0891b2; background: linear-gradient(to bottom, #ffffff, #f0fdfa);">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <img src="/logo.jpg" alt="Logo" style="width: 44px; height: 44px; border-radius: 10px; border: 1px solid #e2e8f0; object-fit: contain; background: white; padding: 2px;" />
            <div>
              <div style="font-size: 15px; font-weight: 700; color: #0f172a;">Progressive Web App (PWA)</div>
              <div style="font-size: 12px; color: #0891b2; font-weight: 600;">Offline Ready · Instant Launch</div>
            </div>
          </div>
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 14px; line-height: 1.4;">
            Install <b>Life Skill Course</b> directly onto your home screen for fast full-screen performance without opening a browser.
          </p>
          <button
            type="button"
            class="btn btn-primary btn-full"
            onClick=${handlePwaInstall}
            disabled=${pwa.isInstalled}
            style="background: linear-gradient(135deg, #0891b2, #1d4ed8);"
          >
            ${pwa.isInstalled ? '✓ App Already Installed as PWA' : '📲 Install Mobile App'}
          </button>
        </div>

        <!-- Sign Out Card -->
        <div class="card" style="border: 1.5px solid #fecaca; background: #fffaf0;">
          <div class="card-title" style="color: #dc2626;">Session Management</div>
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 14px;">
            Signed in as <b>${u.fullName}</b> (@${u.username}) · Role: <span style="text-transform: capitalize;">${u.role.replace('_', ' ')}</span>
          </p>
          <button
            type="button"
            class="btn btn-danger btn-full"
            onClick=${() => setShowLogoutConfirm(true)}
            style="display: flex; align-items: center; justify-content: center; gap: 8px;"
          >
            <svg style="width: 18px; height: 18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
            </svg>
            Log Out from Account
          </button>
        </div>
      `}

      <!-- Record Income / Collection Modal -->
      ${showIncomeModal ? html`
        <div class="modal-overlay" onClick=${() => setShowIncomeModal(false)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-title">Record Income Entry</div>
              <button onClick=${() => setShowIncomeModal(false)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
            </div>
            <form onSubmit=${handleRecordIncome}>
              <div class="form-group">
                <label class="form-label">Income Type</label>
                <select class="form-input" value=${incomeType} onChange=${(e) => setIncomeType(e.target.value)}>
                  <option value="calendar_sale">📅 Calendar Sales Collection</option>
                  <option value="donation">🕌 Campaign Donation</option>
                  <option value="other_income">🎁 Other Miscellaneous Income</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  class="form-input"
                  placeholder="e.g. 500"
                  value=${incomeAmount}
                  onInput=${(e) => setIncomeAmount(e.target.value)}
                  style="font-size: 20px; font-weight: 700; color: #059669;"
                  required
                />
              </div>

              <div class="form-group">
                <label class="form-label">Date</label>
                <input type="date" class="form-input" value=${incomeDate} onInput=${(e) => setIncomeDate(e.target.value)} required />
              </div>

              <div class="form-group">
                <label class="form-label">Donor / Buyer / Notes</label>
                <input type="text" class="form-input" placeholder="e.g. Al-Madeena Store donation" value=${incomeNotes} onInput=${(e) => setIncomeNotes(e.target.value)} />
              </div>

              <button type="submit" class="btn btn-primary btn-full" disabled=${savingIncome}>
                ${savingIncome ? 'Recording...' : 'Record Income Entry'}
              </button>
            </form>
          </div>
        </div>
      ` : ''}

      <!-- Record Expense Modal -->
      ${showExpenseModal ? html`
        <div class="modal-overlay" onClick=${() => setShowExpenseModal(false)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-title">Record Expense</div>
              <button onClick=${() => setShowExpenseModal(false)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
            </div>
            <form onSubmit=${handleRecordExpense}>
              <div class="form-group">
                <label class="form-label">Category</label>
                <select class="form-input" value=${expCategory} onChange=${(e) => setExpCategory(e.target.value)}>
                  <option value="transport">Transport / Travel</option>
                  <option value="food">Food & Refreshments</option>
                  <option value="communication">Communication</option>
                  <option value="stationery">Stationery</option>
                  <option value="printing">Printing</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  class="form-input"
                  placeholder="e.g. 150"
                  value=${expAmount}
                  onInput=${(e) => setExpAmount(e.target.value)}
                  style="font-size: 20px; font-weight: 700; color: #dc2626;"
                  required
                />
              </div>

              <div class="form-group">
                <label class="form-label">Description / Purpose</label>
                <input type="text" class="form-input" placeholder="e.g. Bus fare to town" value=${expDesc} onInput=${(e) => setExpDesc(e.target.value)} required />
              </div>

              <div class="form-group">
                <label class="form-label">Date</label>
                <input type="date" class="form-input" value=${expDate} onInput=${(e) => setExpDate(e.target.value)} required />
              </div>

              <button type="submit" class="btn btn-primary btn-full" disabled=${savingExpense}>
                ${savingExpense ? 'Saving...' : 'Record Expense'}
              </button>
            </form>
          </div>
        </div>
      ` : ''}

      <!-- Logout Confirmation Modal -->
      ${showLogoutConfirm ? html`
        <div class="modal-overlay" onClick=${() => setShowLogoutConfirm(false)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()} style="max-width: 380px; padding: 22px; text-align: center;">
            <div style="width: 52px; height: 52px; border-radius: 50%; background: #fee2e2; color: #dc2626; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px;">
              <svg style="width: 28px; height: 28px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
              </svg>
            </div>
            <h3 style="font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 6px;">
              Confirm Sign Out
            </h3>
            <p style="font-size: 13.5px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">
              Are you sure you want to log out from <b>${loggedInUser ? loggedInUser.fullName : 'Life Skill Course'}</b>?
            </p>
            <div style="display: flex; gap: 10px; justify-content: center;">
              <button type="button" class="btn btn-secondary" onClick=${() => setShowLogoutConfirm(false)} style="flex: 1;">
                Cancel
              </button>
              <button type="button" class="btn btn-danger" onClick=${handleConfirmLogout} style="flex: 1;">
                Log Out
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- iOS Safari PWA Install Modal -->
      ${showIOSModal ? html`
        <div class="modal-overlay" onClick=${() => setShowIOSModal(false)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()} style="max-width: 400px; padding: 22px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
              <h3 style="font-size: 17px; font-weight: 700; color: var(--text); margin: 0;">Install on iPhone / iPad</h3>
              <button onClick=${() => setShowIOSModal(false)} style="background: none; border: none; font-size: 18px; cursor: pointer; color: var(--text-light);">✕</button>
            </div>
            <div style="font-size: 14px; line-height: 1.6; color: var(--text); margin-bottom: 18px;">
              <p style="margin-bottom: 10px;">To install <b>Life Skill Course</b> as a standalone mobile app on iOS:</p>
              <ol style="padding-left: 20px; margin-bottom: 12px;">
                <li style="margin-bottom: 6px;">Tap the <b>Share</b> button in Safari bottom bar.</li>
                <li style="margin-bottom: 6px;">Scroll down and tap <b>Add to Home Screen</b>.</li>
                <li>Tap <b>Add</b> in the top right corner.</li>
              </ol>
              <div style="font-size: 12.5px; color: #0284c7; background: #e0f2fe; padding: 8px 12px; border-radius: 8px;">
                ✓ The app will launch without browser address bars and support offline camp entries!
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-full" onClick=${() => setShowIOSModal(false)}>
              Got It
            </button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}
