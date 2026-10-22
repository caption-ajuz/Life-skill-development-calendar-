import api from '../services/api.js';
import { currentUser, logout } from '../store/auth.js';
import { syncStatus, syncAll } from '../services/sync.js';
import { compressImage } from '../utils/image.js';

const html = window.html;
const { useState, useEffect, useCallback } = window.hooks;

export default function Settings() {
  const user = currentUser.value;
  const status = syncStatus.value;

  // Personal profile state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinPassword, setPinPassword] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Admin Setup Area states (Super Admin)
  const [adminTab, setAdminTab] = useState('numbers'); // 'numbers' | 'users'
  const [campaignData, setCampaignData] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [campaignForm, setCampaignForm] = useState({
    totalStock: 5000,
    calendarPrice: 100,
    initialInvestment: 20000,
    printingCost: 50000,
    campaignYear: new Date().getFullYear(),
    notes: ''
  });
  const [savingCampaign, setSavingCampaign] = useState(false);

  // Admin user management state
  const [adminUsers, setAdminUsers] = useState([]);
  const [teamsList, setTeamsList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // User object being edited
  const [credForm, setCredForm] = useState({ username: '', password: '', pin: '', clearPassword: false, clearPin: false });
  const [savingCred, setSavingCred] = useState(false);

  // PWA install prompt handler
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  // Fetch Admin Setup data if user is Super Admin
  const loadAdminSetupData = useCallback(async () => {
    if (!user || user.role !== 'super_admin') return;

    try {
      // 1. Fetch Campaign Config
      const campRes = await api.get('/api/stock/campaign');
      if (campRes && campRes.success && campRes.data) {
        setCampaignData(campRes.data);
        setCampaignForm({
          totalStock: campRes.data.totalStock ?? 5000,
          calendarPrice: campRes.data.calendarPrice ?? 100,
          initialInvestment: campRes.data.initialInvestment ?? 20000,
          printingCost: campRes.data.printingCost ?? 50000,
          campaignYear: campRes.data.campaignYear ?? new Date().getFullYear(),
          notes: campRes.data.notes ?? ''
        });
      }

      // 2. Fetch Dashboard summary (distributed content, total, revenue)
      const dashRes = await api.get('/api/dashboard/admin');
      if (dashRes && dashRes.success && dashRes.data) {
        setDashboardStats(dashRes.data);
      }

      // 3. Fetch Users
      setLoadingUsers(true);
      const [usersRes, teamsRes] = await Promise.all([
        api.get('/api/users?limit=100'),
        api.get('/api/teams')
      ]);

      if (usersRes && usersRes.success && usersRes.data) {
        setAdminUsers(usersRes.data.users || []);
      }
      if (teamsRes && teamsRes.success && teamsRes.data) {
        setTeamsList(teamsRes.data || []);
      }
    } catch (err) {
      console.warn('Could not load all admin setup data:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && user.role === 'super_admin') {
      loadAdminSetupData();
    }
  }, [user, loadAdminSetupData]);

  // Save campaign calculations & numbers
  const handleSaveCampaign = async (e) => {
    e.preventDefault();
    setSavingCampaign(true);
    try {
      const res = await api.put('/api/stock/campaign', {
        totalStock: Number(campaignForm.totalStock),
        calendarPrice: Number(campaignForm.calendarPrice),
        initialInvestment: Number(campaignForm.initialInvestment),
        printingCost: Number(campaignForm.printingCost),
        campaignYear: Number(campaignForm.campaignYear),
        notes: campaignForm.notes
      });
      if (res && res.success) {
        if (window.showToast) window.showToast('Campaign numbers & calculations saved! ✓', 'success');
        loadAdminSetupData();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to save campaign numbers.', 'error');
    } finally {
      setSavingCampaign(false);
    }
  };

  // Open edit modal for user credentials
  const handleOpenEditUser = (u) => {
    setEditingUser(u);
    setCredForm({
      username: u.username || '',
      password: '',
      pin: '',
      clearPassword: false,
      clearPin: false
    });
  };

  // Save user credentials (username, password, PIN, or delete/clear password/pin)
  const handleSaveUserCredentials = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    setSavingCred(true);
    try {
      const payload = {
        username: credForm.username.trim()
      };
      if (credForm.clearPassword) {
        payload.clearPassword = true;
      } else if (credForm.password) {
        payload.password = credForm.password;
      }

      if (credForm.clearPin) {
        payload.clearPin = true;
      } else if (credForm.pin) {
        payload.pin = credForm.pin;
      }

      const res = await api.put(`/api/users/${editingUser._id}/credentials`, payload);
      if (res && res.success) {
        if (window.showToast) window.showToast(`Updated credentials for @${editingUser.username}! ✓`, 'success');
        setEditingUser(null);
        loadAdminSetupData();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to update credentials.', 'error');
    } finally {
      setSavingCred(false);
    }
  };

  // Quick action: Delete/Clear password directly
  const handleDeletePassword = async (targetUser) => {
    if (!confirm(`Are you sure you want to clear the password for @${targetUser.username}?`)) return;

    try {
      await api.delete(`/api/users/${targetUser._id}/password`);
      if (window.showToast) window.showToast(`Password cleared for @${targetUser.username}.`, 'info');
      loadAdminSetupData();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to clear password.', 'error');
    }
  };

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      if (window.showToast) window.showToast('App is already installed or browser does not support installation.', 'info');
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
          const res = await api.post('/api/uploads/profile-photo', { photoData: base64Data });
          if (res && res.success) {
            currentUser.value = { ...currentUser.value, profilePhoto: res.photoUrl };
            if (window.showToast) window.showToast('Profile photo updated! ✓', 'success');
          }
        } catch (postErr) {
          if (window.showToast) window.showToast(postErr.message || 'Failed to upload photo.', 'error');
        } finally {
          setPhotoUploading(false);
        }
      };
      reader.readAsDataURL(compressedBlob);
    } catch (err) {
      console.error('Photo compress error:', err);
      setPhotoUploading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      if (window.showToast) window.showToast('New passwords do not match.', 'error');
      return;
    }
    if (newPassword.length < 6) {
      if (window.showToast) window.showToast('Password must be at least 6 characters.', 'error');
      return;
    }

    setPasswordLoading(true);
    try {
      await api.put('/api/auth/change-password', {
        currentPassword,
        newPassword
      });
      if (window.showToast) window.showToast('Password changed successfully! ✓', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to update password.', 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleChangePin = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(newPin) || newPin !== confirmPin) {
      if (window.showToast) window.showToast('Enter and confirm the same 6-digit PIN.', 'error');
      return;
    }
    setPinLoading(true);
    try {
      await api.put('/api/auth/change-pin', { currentPassword: pinPassword, newPin });
      if (window.showToast) window.showToast('Phone sign-in PIN updated.', 'success');
      setNewPin('');
      setConfirmPin('');
      setPinPassword('');
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to update PIN.', 'error');
    } finally {
      setPinLoading(false);
    }
  };

  if (!user) return null;

  // Calculation helpers
  const totalStockNum = Number(campaignForm.totalStock) || 0;
  const unitPriceNum = Number(campaignForm.calendarPrice) || 0;
  const distributedNum = dashboardStats ? (dashboardStats.totalDistributed || 0) : 1250;
  const distPercent = totalStockNum > 0 ? ((distributedNum / totalStockNum) * 100).toFixed(1) : '0.0';
  const grossExpected = totalStockNum * unitPriceNum;
  const initialInv = Number(campaignForm.initialInvestment) || 0;
  const printCost = Number(campaignForm.printingCost) || 0;
  const totalExp = initialInv + printCost;
  const collectedNum = dashboardStats ? (dashboardStats.totalCollected || 0) : distributedNum * unitPriceNum;
  const projectedSurplus = collectedNum - totalExp;

  return html`
    <div class="page">
      <h2 style="font-size: 19px; font-weight: 700; margin-bottom: 12px;">My Account & Settings</h2>

      <!-- Profile Header Card -->
      <div class="card" style="display: flex; align-items: center; gap: 14px;">
        <div style="position: relative;">
          <div class="list-avatar" style="width: 60px; height: 60px; font-size: 24px; background: linear-gradient(135deg, var(--primary), var(--accent)); color: white;">
            ${user.profilePhoto ? html`<img src="${user.profilePhoto}" alt="" />` : user.fullName.charAt(0)}
          </div>
          <label style="position: absolute; bottom: -4px; right: -4px; background: white; border-radius: 50%; padding: 4px; box-shadow: var(--shadow-sm); cursor: pointer;">
            <svg style="width: 16px; height: 16px; color: var(--primary);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
            <input type="file" accept="image/*" style="display: none;" onChange=${handlePhotoUpload} disabled=${photoUploading} />
          </label>
        </div>

        <div style="flex: 1;">
          <div style="font-size: 17px; font-weight: 700;">${user.fullName}</div>
          <div style="font-size: 13px; color: var(--text-secondary);">@${user.username}</div>
          ${user.phone ? html`<div style="font-size: 12px; color: var(--text-secondary);">${user.phone}</div>` : ''}
          <div style="font-size: 12px; margin-top: 2px;">
            <span class="badge badge-info" style="text-transform: capitalize;">${user.role.replace('_', ' ')}</span>
            ${user.teamId ? html`<span style="margin-left: 6px; color: var(--text-secondary); font-weight: 500;">${user.teamId.name}</span>` : ''}
          </div>
        </div>
      </div>

      <!-- SUPER ADMIN SETUP AREA -->
      ${user.role === 'super_admin' ? html`
        <div class="card" style="border: 2px solid var(--primary); background: #fdfefe;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="font-size: 16px; font-weight: 700; color: var(--primary-dark); display: flex; align-items: center; gap: 6px;">
              <span>👑</span> Admin & Editor Setup Area
            </div>
            <span class="badge badge-success">Full Access</span>
          </div>

          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 14px;">
            Manage campaign content distribution numbers, recalculate financial metrics, and control Usthad and Team credentials.
          </p>

          <!-- Tabs: Numbers & Calculations vs Team & Usthad Credentials -->
          <div class="tabs" style="margin-bottom: 14px;">
            <button
              class="tab ${adminTab === 'numbers' ? 'active' : ''}"
              onClick=${() => setAdminTab('numbers')}
            >
              📊 Numbers & Calculations
            </button>
            <button
              class="tab ${adminTab === 'users' ? 'active' : ''}"
              onClick=${() => setAdminTab('users')}
            >
              👥 Teams & Usthad Logins
            </button>
          </div>

          <!-- TAB 1: EDIT CONTENT DISTRIBUTED, TOTAL, NUMBERS & CALCULATIONS -->
          ${adminTab === 'numbers' ? html`
            <div>
              <!-- INITIAL INFORMATION SUMMARY CARDS -->
              <div style="background: #f1f5f9; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px;">
                  📋 Initial Campaign Information
                </div>

                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                  <div style="background: white; border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px;">
                    <div style="font-size: 11px; color: var(--text-secondary);">Total Content (Stock)</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--text);">${totalStockNum.toLocaleString('en-IN')}</div>
                  </div>

                  <div style="background: white; border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px;">
                    <div style="font-size: 11px; color: var(--text-secondary);">Distributed Content</div>
                    <div style="font-size: 18px; font-weight: 700; color: #059669;">
                      ${distributedNum.toLocaleString('en-IN')} <span style="font-size: 11px; color: var(--text-secondary);">(${distPercent}%)</span>
                    </div>
                  </div>

                  <div style="background: white; border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px;">
                    <div style="font-size: 11px; color: var(--text-secondary);">Expected Revenue</div>
                    <div style="font-size: 16px; font-weight: 700; color: var(--primary);">₹${grossExpected.toLocaleString('en-IN')}</div>
                  </div>

                  <div style="background: white; border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px;">
                    <div style="font-size: 11px; color: var(--text-secondary);">Total Investment & Costs</div>
                    <div style="font-size: 16px; font-weight: 700; color: #dc2626;">₹${totalExp.toLocaleString('en-IN')}</div>
                  </div>
                </div>

                <div style="margin-top: 10px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--border); padding-top: 8px;">
                  <span>Estimated Net Surplus / Balance:</span>
                  <b style="color: ${projectedSurplus >= 0 ? '#059669' : '#dc2626'}; font-size: 14px;">
                    ₹${projectedSurplus.toLocaleString('en-IN')}
                  </b>
                </div>
              </div>

              <!-- EDIT NUMBERS & CALCULATIONS FORM -->
              <form onSubmit=${handleSaveCampaign}>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                  <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label" style="font-size: 12px;">Total Stock (Calendars)</label>
                    <input
                      type="number"
                      class="form-input"
                      value=${campaignForm.totalStock}
                      onInput=${(e) => setCampaignForm({ ...campaignForm, totalStock: e.target.value })}
                      required
                      min="0"
                    />
                  </div>

                  <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label" style="font-size: 12px;">Unit Price (₹)</label>
                    <input
                      type="number"
                      class="form-input"
                      value=${campaignForm.calendarPrice}
                      onInput=${(e) => setCampaignForm({ ...campaignForm, calendarPrice: e.target.value })}
                      required
                      min="0"
                    />
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                  <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label" style="font-size: 12px;">Initial Investment (₹)</label>
                    <input
                      type="number"
                      class="form-input"
                      value=${campaignForm.initialInvestment}
                      onInput=${(e) => setCampaignForm({ ...campaignForm, initialInvestment: e.target.value })}
                      min="0"
                    />
                  </div>

                  <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label" style="font-size: 12px;">Printing Cost (₹)</label>
                    <input
                      type="number"
                      class="form-input"
                      value=${campaignForm.printingCost}
                      onInput=${(e) => setCampaignForm({ ...campaignForm, printingCost: e.target.value })}
                      min="0"
                    />
                  </div>
                </div>

                <div class="form-group" style="margin-bottom: 14px;">
                  <label class="form-label" style="font-size: 12px;">Campaign Notes & Title</label>
                  <input
                    type="text"
                    class="form-input"
                    value=${campaignForm.notes}
                    onInput=${(e) => setCampaignForm({ ...campaignForm, notes: e.target.value })}
                    placeholder="e.g. Markazul Hidayathil Islamiyya Calendar Campaign"
                  />
                </div>

                <button type="submit" class="btn btn-primary btn-full" disabled=${savingCampaign}>
                  ${savingCampaign ? 'Saving Numbers...' : '💾 Save Numbers & Update Calculations'}
                </button>
              </form>
            </div>
          ` : html`
            <!-- TAB 2: TEAMS & USTHAD CREDENTIALS (USERNAME, PASSWORD, PIN EDIT & DELETE) -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-size: 13px; font-weight: 600;">Usthad & Team Leaders (${adminUsers.length})</span>
                <button
                  type="button"
                  class="btn btn-sm btn-outline"
                  onClick=${loadAdminSetupData}
                  disabled=${loadingUsers}
                >
                  🔄 Refresh
                </button>
              </div>

              ${loadingUsers ? html`
                <div class="text-center" style="padding: 20px;">
                  <div class="spinner" style="margin: 0 auto 10px;"></div>
                  <div style="font-size: 13px; color: var(--text-secondary);">Loading user accounts...</div>
                </div>
              ` : html`
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  ${adminUsers.map((u) => html`
                    <div
                      key=${u._id}
                      style="
                        background: white;
                        border: 1px solid var(--border);
                        border-radius: 8px;
                        padding: 10px 12px;
                        display: flex;
                        flex-direction: column;
                        gap: 6px;
                      "
                    >
                      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                          <b style="font-size: 14px; color: var(--text);">${u.fullName}</b>
                          <div style="font-size: 12px; color: var(--text-secondary);">
                            Username: <code style="background: #e2e8f0; padding: 1px 4px; border-radius: 4px;">@${u.username}</code>
                          </div>
                          ${u.phone ? html`<div style="font-size: 11px; color: var(--text-light);">${u.phone}</div>` : ''}
                        </div>
                        <div style="text-align: right;">
                          <span class="badge ${u.role === 'usthad' ? 'badge-warning' : (u.role === 'super_admin' ? 'badge-error' : 'badge-info')}" style="font-size: 10px; text-transform: uppercase;">
                            ${u.role.replace('_', ' ')}
                          </span>
                          ${u.teamId ? html`<div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${u.teamId.name}</div>` : ''}
                        </div>
                      </div>

                      <!-- Credentials Status Bar -->
                      <div style="background: #f8fafc; border-radius: 6px; padding: 6px 8px; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                          <span>Password: </span>
                          <b style="color: #0284c7;">${u.passwordHint ? u.passwordHint : '••••••••'}</b>
                          <span style="margin: 0 6px; color: var(--border);">|</span>
                          <span>PIN: </span>
                          <b style="color: #059669;">${u.pinHint ? u.pinHint : (u.role === 'usthad' ? '2222' : (u.role === 'team_leader' ? '3333' : (u.role === 'team_member' ? '4444' : '1111')))}</b>
                        </div>

                        <div style="display: flex; gap: 6px;">
                          <button
                            type="button"
                            class="btn btn-sm btn-secondary"
                            onClick=${() => handleOpenEditUser(u)}
                            style="padding: 4px 8px; font-size: 11px; min-height: 28px;"
                            title="Edit username, password and PIN"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            class="btn btn-sm btn-danger"
                            onClick=${() => handleDeletePassword(u)}
                            style="padding: 4px 8px; font-size: 11px; min-height: 28px;"
                            title="Delete / Clear password"
                          >
                            🗑️ Delete Pass
                          </button>
                        </div>
                      </div>
                    </div>
                  `)}
                </div>
              `}
            </div>
          `}
        </div>
      ` : ''}

      <!-- EDIT USER CREDENTIALS MODAL -->
      ${editingUser ? html`
        <div class="modal-overlay" onClick=${() => setEditingUser(null)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-title">Edit Credentials: ${editingUser.fullName}</div>
              <button class="navbar-btn" style="color: var(--text);" onClick=${() => setEditingUser(null)}>✕</button>
            </div>

            <form onSubmit=${handleSaveUserCredentials}>
              <div class="form-group">
                <label class="form-label" style="font-size: 13px;">Username</label>
                <input
                  type="text"
                  class="form-input"
                  value=${credForm.username}
                  onInput=${(e) => setCredForm({ ...credForm, username: e.target.value })}
                  required
                />
              </div>

              <div class="form-group">
                <label class="form-label" style="font-size: 13px;">Set New Password</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="Enter new password (or leave blank to keep unchanged)"
                  value=${credForm.password}
                  onInput=${(e) => setCredForm({ ...credForm, password: e.target.value, clearPassword: false })}
                  disabled=${credForm.clearPassword}
                />
                <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #dc2626; margin-top: 6px; cursor: pointer;">
                  <input
                    type="checkbox"
                    checked=${credForm.clearPassword}
                    onChange=${(e) => setCredForm({ ...credForm, clearPassword: e.target.checked, password: '' })}
                  />
                  <span>Delete / Clear password completely for this user</span>
                </label>
              </div>

              <div class="form-group">
                <label class="form-label" style="font-size: 13px;">Set 4-Digit or 6-Digit PIN</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="e.g. 1111, 2222, 3333, 4444"
                  maxLength="6"
                  value=${credForm.pin}
                  onInput=${(e) => setCredForm({ ...credForm, pin: e.target.value.replace(/\D/g, ''), clearPin: false })}
                  disabled=${credForm.clearPin}
                />
                <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #dc2626; margin-top: 6px; cursor: pointer;">
                  <input
                    type="checkbox"
                    checked=${credForm.clearPin}
                    onChange=${(e) => setCredForm({ ...credForm, clearPin: e.target.checked, pin: '' })}
                  />
                  <span>Delete / Clear PIN for this user</span>
                </label>
              </div>

              <div class="btn-group" style="margin-top: 18px;">
                <button type="button" class="btn btn-secondary btn-full" onClick=${() => setEditingUser(null)}>
                  Cancel
                </button>
                <button type="submit" class="btn btn-primary btn-full" disabled=${savingCred}>
                  ${savingCred ? 'Saving...' : 'Save Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ` : ''}

      <!-- Offline Synchronization Card -->
      <div class="card">
        <div class="card-title">Synchronization & Offline Mode</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px;">
          <span>Network Connection:</span>
          <b>${status.isOnline ? '🟢 Connected (Online)' : '🟡 Offline Mode'}</b>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 14px;">
          <span>Unsynced Offline Items:</span>
          <b style="color: ${status.pendingCount > 0 ? '#dc2626' : '#059669'};">${status.pendingCount} entry(ies)</b>
        </div>
        <button
          class="btn btn-secondary btn-full"
          onClick=${() => syncAll()}
          disabled=${status.isSyncing || !status.isOnline}
        >
          ${status.isSyncing ? 'Synchronizing...' : 'Sync Now with Central Server'}
        </button>
      </div>

      <!-- Install App Banner -->
      ${deferredPrompt
        ? html`
            <div class="install-banner">
              <div style="flex: 1; font-size: 13px;">
                <b>Install on Phone:</b> Add Life Skill App to your home screen for quick offline access.
              </div>
              <button onClick=${handleInstallPWA}>Install</button>
            </div>
          `
        : ''}

      ${user.role === 'usthad' ? html`
        <div class="card">
          <div class="card-title">Phone + PIN Sign-in</div>
          <p class="form-hint" style="margin-bottom: 12px;">Update your 6-digit PIN. Your current password is required to verify this change.</p>
          <form onSubmit=${handleChangePin}>
            <div class="form-group">
              <label class="form-label" style="font-size: 13px;">Current Password</label>
              <input type="password" class="form-input" value=${pinPassword} onInput=${(e) => setPinPassword(e.target.value)} autocomplete="current-password" required />
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 13px;">New 6-digit PIN</label>
              <input type="password" class="form-input" value=${newPin} onInput=${(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required />
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 13px;">Confirm New PIN</label>
              <input type="password" class="form-input" value=${confirmPin} onInput=${(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required />
            </div>
            <button type="submit" class="btn btn-secondary btn-full" disabled=${pinLoading}>
              ${pinLoading ? 'Updating...' : 'Update PIN'}
            </button>
          </form>
        </div>
      ` : ''}

      <!-- Change Password -->
      <div class="card">
        <div class="card-title">Change Password</div>
        <form onSubmit=${handleChangePassword}>
          <div class="form-group">
            <label class="form-label" style="font-size: 13px;">Current Password</label>
            <input type="password" class="form-input" value=${currentPassword} onInput=${(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size: 13px;">New Password (min 6 characters)</label>
            <input type="password" class="form-input" value=${newPassword} onInput=${(e) => setNewPassword(e.target.value)} required />
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size: 13px;">Confirm New Password</label>
            <input type="password" class="form-input" value=${confirmPassword} onInput=${(e) => setConfirmPassword(e.target.value)} required />
          </div>
          <button type="submit" class="btn btn-secondary btn-full" disabled=${passwordLoading}>
            ${passwordLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      <!-- App Info & Logout -->
      <div class="card text-center" style="margin-top: 16px;">
        <div style="font-size: 12px; color: var(--text-light); margin-bottom: 12px;">
          Life Skill Course v1.0.0<br />
          Markazul Hidayathil Islamiyya, Kombam
        </div>
        <button class="btn btn-danger btn-full" onClick=${() => logout()}>
          Sign Out of Account
        </button>
      </div>
    </div>
  `;
}
