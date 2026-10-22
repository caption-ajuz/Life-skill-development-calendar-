import api from '../services/api.js';
import { currentUser, logout } from '../store/auth.js';
import { syncStatus, syncAll } from '../services/sync.js';
import { compressImage } from '../utils/image.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Settings() {
  const user = currentUser.value;
  const status = syncStatus.value;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinPassword, setPinPassword] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  // PWA install prompt handler
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

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
      // Compress image client-side before sending
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
