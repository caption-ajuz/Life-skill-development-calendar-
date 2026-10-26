import { currentUser, logout } from '../store/auth.js';
import { syncStatus, syncAll } from '../services/sync.js';
import { pwaState, promptInstall } from '../services/pwa.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

// Global Toast state
const toastSignal = window.signals.signal([]);

window.showToast = function (message, type = 'info', duration = 3500) {
  const id = Date.now() + Math.random();
  toastSignal.value = [...toastSignal.value, { id, message, type }];
  setTimeout(() => {
    toastSignal.value = toastSignal.value.filter((t) => t.id !== id);
  }, duration);
};

export function ToastContainer() {
  const [toasts, setToasts] = useState(() => toastSignal.value);
  useEffect(() => {
    return toastSignal.subscribe ? toastSignal.subscribe(setToasts) : undefined;
  }, []);

  if (!toasts.length) return null;

  return html`
    <div class="toast-container">
      ${toasts.map(
        (t) => html`
          <div key=${t.id} class="toast toast-${t.type}">
            ${t.message}
          </div>
        `
      )}
    </div>
  `;
}

export function SyncBar() {
  const [status, setStatus] = useState(() => syncStatus.value);
  useEffect(() => {
    return syncStatus.subscribe ? syncStatus.subscribe(setStatus) : undefined;
  }, []);

  if (status.isSyncing) {
    return html`
      <div class="sync-bar syncing">
        🔄 Synchronizing data with central server...
      </div>
    `;
  }

  if (!status.isOnline) {
    return html`
      <div class="sync-bar offline">
        ⚡ You are offline. Changes are saved locally (${status.pendingCount} pending).
      </div>
    `;
  }

  if (status.pendingCount > 0) {
    return html`
      <div class="sync-bar offline" style="cursor: pointer;" onClick=${() => syncAll()}>
        ⚠️ ${status.pendingCount} entry(ies) pending sync. <u>Tap here to sync now</u>.
      </div>
    `;
  }

  return null;
}

export function Navbar({ title }) {
  const [user, setUser] = useState(() => currentUser.value);
  const [status, setStatus] = useState(() => syncStatus.value);
  const [dbStatus, setDbStatus] = useState({ connected: false, message: 'Checking...', details: '' });
  const [showDbModal, setShowDbModal] = useState(false);
  const [checkingDb, setCheckingDb] = useState(false);
  const [longPressed, setLongPressed] = useState(false);

  // PWA and Logout states
  const [pwa, setPwa] = useState(() => pwaState.value);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installing, setInstalling] = useState(false);

  let pressTimer = null;

  const fetchDbStatus = async (isRetry = false) => {
    setCheckingDb(true);
    try {
      const url = isRetry ? '/api/db-status/retry' : '/api/db-status';
      const options = isRetry ? { method: 'POST' } : { method: 'GET' };
      const res = await fetch(url, options);
      const data = await res.json();
      if (data && data.data) {
        setDbStatus(data.data);
      }
    } catch (err) {
      setDbStatus({
        connected: false,
        message: 'Could not connect to server',
        details: 'Network error or server unreachable: ' + err.message
      });
    } finally {
      setCheckingDb(false);
    }
  };

  useEffect(() => {
    const unsubUser = currentUser.subscribe ? currentUser.subscribe(setUser) : null;
    const unsubStatus = syncStatus.subscribe ? syncStatus.subscribe(setStatus) : null;
    const unsubPwa = pwaState.subscribe ? pwaState.subscribe(setPwa) : null;
    fetchDbStatus();
    const interval = setInterval(fetchDbStatus, 30000);
    return () => {
      if (unsubUser) unsubUser();
      if (unsubStatus) unsubStatus();
      if (unsubPwa) unsubPwa();
      clearInterval(interval);
    };
  }, []);

  const handlePressStart = () => {
    setLongPressed(false);
    pressTimer = setTimeout(() => {
      setLongPressed(true);
      setShowDbModal(true);
    }, 450);
  };

  const handlePressEnd = () => {
    if (pressTimer) clearTimeout(pressTimer);
  };

  const handleInstallClick = async () => {
    setInstalling(true);
    try {
      const res = await promptInstall();
      if (res && res.outcome === 'accepted') {
        if (window.showToast) window.showToast('Life Skill Course app installed! ✓', 'success');
      } else if (res && res.outcome === 'already_installed') {
        if (window.showToast) window.showToast('App is already installed on this device!', 'info');
      } else {
        setShowInstallModal(true);
      }
    } catch (_) {
      setShowInstallModal(true);
    } finally {
      setInstalling(false);
    }
  };

  const handleConfirmLogout = async () => {
    setShowLogoutConfirm(false);
    if (window.showToast) window.showToast('Logged out successfully', 'info');
    await logout();
  };

  const getSyncDot = () => {
    if (!status.isOnline) return html`<span title="Offline" style="width: 10px; height: 10px; border-radius: 50%; background: #fbbf24; display: inline-block;"></span>`;
    if (status.isSyncing) return html`<span title="Syncing" style="width: 10px; height: 10px; border-radius: 50%; background: #60a5fa; display: inline-block; animation: spin 1s infinite;"></span>`;
    if (status.pendingCount > 0) return html`<span title="${status.pendingCount} pending" style="width: 10px; height: 10px; border-radius: 50%; background: #f87171; display: inline-block;"></span>`;
    return html`<span title="Online & Synced" style="width: 10px; height: 10px; border-radius: 50%; background: #34d399; display: inline-block;"></span>`;
  };

  return html`
    <nav class="navbar">
      <img src="/logo.jpg" alt="Logo" class="navbar-logo" />
      <div class="navbar-title">${title || 'Life Skill Course'}</div>
      <div style="display: flex; align-items: center; gap: 7px;">
        <!-- Database Connection Indicator Dot -->
        <button
          type="button"
          class="navbar-btn"
          title="${dbStatus.connected ? 'Database Connected (Green) - Press/hold for details' : 'Database Offline / Fallback (Red) - Press/hold for problem details'}"
          onMouseDown=${handlePressStart}
          onMouseUp=${handlePressEnd}
          onTouchStart=${handlePressStart}
          onTouchEnd=${handlePressEnd}
          onClick=${() => setShowDbModal(true)}
          style="display: flex; align-items: center; gap: 4px; padding: 4px 7px; border-radius: 12px; background: rgba(0,0,0,0.25); border: none; cursor: pointer;"
        >
          <span
            style="width: 9px; height: 9px; border-radius: 50%; background: ${dbStatus.connected ? '#10b981' : '#ef4444'}; display: inline-block; box-shadow: 0 0 6px ${dbStatus.connected ? '#10b981' : '#ef4444'};"
          ></span>
          <span style="font-size: 11px; font-weight: 700; color: #fff;">
            ${dbStatus.connected ? 'DB' : 'DB'}
          </span>
        </button>

        <!-- PWA Install Button (hides automatically if already running in standalone PWA mode) -->
        ${!pwa.isInstalled
          ? html`
              <button
                type="button"
                class="navbar-btn"
                title="Install Life Skill App"
                onClick=${handleInstallClick}
                disabled=${installing}
                style="display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 12px; background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.4); color: white; cursor: pointer;"
              >
                <svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                </svg>
                <span style="font-size: 11px; font-weight: 700;">Install</span>
              </button>
            `
          : ''}

        <!-- Sync Button -->
        <button class="navbar-btn" onClick=${() => syncAll()} title="Sync Status" style="font-size: 13px; display: flex; align-items: center; gap: 6px;">
          ${getSyncDot()}
          ${status.pendingCount > 0 ? html`<span style="font-size: 11px; font-weight: 700; background: rgba(0,0,0,0.3); padding: 1px 6px; border-radius: 10px;">${status.pendingCount}</span>` : ''}
        </button>

        <!-- Profile Link -->
        <a href="#/profile" style="text-decoration: none; color: white;" title="My Profile">
          <div class="list-avatar" style="width: 32px; height: 32px; font-size: 13px; background: rgba(255,255,255,0.2); color: white;">
            ${user && user.profilePhoto ? html`<img src="${user.profilePhoto}" alt="Avatar" />` : (user ? user.fullName.charAt(0).toUpperCase() : 'U')}
          </div>
        </a>

        <!-- Logout Button -->
        <button
          type="button"
          class="navbar-btn"
          title="Log Out"
          onClick=${() => setShowLogoutConfirm(true)}
          style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: rgba(239, 68, 68, 0.28); border: 1px solid rgba(239, 68, 68, 0.5); color: #fee2e2; cursor: pointer;"
        >
          <svg style="width: 17px; height: 17px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
          </svg>
        </button>
      </div>
    </nav>

    <!-- Database Diagnostic Modal -->
    ${showDbModal
      ? html`
          <div class="modal-overlay" onClick=${() => setShowDbModal(false)}>
            <div class="modal" onClick=${(e) => e.stopPropagation()} style="max-width: 420px; padding: 20px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <h3 style="margin: 0; font-size: 17px; font-weight: 700; color: var(--text);">
                  Database Connection Status
                </h3>
                <button
                  onClick=${() => setShowDbModal(false)}
                  style="border: none; background: none; font-size: 18px; cursor: pointer; color: var(--text-light);"
                >
                  ✕
                </button>
              </div>

              <!-- Connection Status Banner -->
              <div
                style="padding: 12px; border-radius: 8px; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; background: ${dbStatus.connected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; border: 1px solid ${dbStatus.connected ? '#10b981' : '#ef4444'};"
              >
                <span
                  style="width: 14px; height: 14px; border-radius: 50%; background: ${dbStatus.connected ? '#10b981' : '#ef4444'}; display: inline-block; box-shadow: 0 0 8px ${dbStatus.connected ? '#10b981' : '#ef4444'}; flex-shrink: 0;"
                ></span>
                <div>
                  <div style="font-weight: 700; font-size: 14px; color: ${dbStatus.connected ? '#065f46' : '#991b1b'};">
                    ${dbStatus.connected ? '🟢 Database Connected' : '🔴 Database Not Connected'}
                  </div>
                  <div style="font-size: 12px; color: var(--text-light); margin-top: 2px;">
                    ${dbStatus.message || (dbStatus.connected ? 'Active MongoDB connection' : 'Local In-Memory Fallback')}
                  </div>
                </div>
              </div>

              <!-- Diagnostic Details Box -->
              <div style="margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-light); margin-bottom: 6px;">
                  What Problem Happened:
                </div>
                <div
                  style="font-size: 13px; line-height: 1.5; color: var(--text); background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; word-break: break-word; font-family: monospace;"
                >
                  ${dbStatus.details || dbStatus.error || 'Operating in fallback mode. Central MongoDB host is unreachable or unconfigured.'}
                </div>
              </div>

              <div style="font-size: 12px; line-height: 1.4; color: var(--text-light); margin-bottom: 16px;">
                💡 <b>System Note:</b> The portal has built-in zero-downtime persistence. All distribution entries, collection records, and reports continue to operate seamlessly using the secure local dataset.
              </div>

              <!-- Action Buttons -->
              <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button
                  type="button"
                  class="btn btn-secondary"
                  onClick=${() => fetchDbStatus(true)}
                  disabled=${checkingDb}
                  style="padding: 8px 14px; font-size: 13px;"
                >
                  ${checkingDb ? 'Testing Connection...' : '🔄 Retry Connection'}
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  onClick=${() => setShowDbModal(false)}
                  style="padding: 8px 16px; font-size: 13px;"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        `
      : ''}

    <!-- Logout Confirmation Modal -->
    ${showLogoutConfirm
      ? html`
          <div class="modal-overlay" onClick=${() => setShowLogoutConfirm(false)}>
            <div class="modal" onClick=${(e) => e.stopPropagation()} style="max-width: 380px; padding: 22px; text-align: center;">
              <div
                style="width: 52px; height: 52px; border-radius: 50%; background: #fee2e2; color: #dc2626; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px;"
              >
                <svg style="width: 28px; height: 28px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                </svg>
              </div>
              <h3 style="font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 6px;">
                Confirm Sign Out
              </h3>
              <p style="font-size: 13.5px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">
                Are you sure you want to log out from <b>${user ? user.fullName : 'Life Skill Course'}</b>?
              </p>
              <div style="display: flex; gap: 10px; justify-content: center;">
                <button
                  type="button"
                  class="btn btn-secondary"
                  onClick=${() => setShowLogoutConfirm(false)}
                  style="flex: 1;"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="btn btn-danger"
                  onClick=${handleConfirmLogout}
                  style="flex: 1;"
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        `
      : ''}

    <!-- Universal PWA Install Instructions Modal -->
    ${showInstallModal
      ? html`
          <div class="modal-overlay" onClick=${() => setShowInstallModal(false)}>
            <div class="modal" onClick=${(e) => e.stopPropagation()} style="max-width: 420px; padding: 22px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <img src="/logo.jpg" alt="Logo" style="width: 36px; height: 36px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; padding: 2px;" />
                  <div>
                    <h3 style="font-size: 16px; font-weight: 700; color: var(--text); margin: 0;">
                      Install Life Skill App
                    </h3>
                    <div style="font-size: 11px; color: #0891b2; font-weight: 600;">Fast Launch · Full Offline Support</div>
                  </div>
                </div>
                <button
                  onClick=${() => setShowInstallModal(false)}
                  style="background: none; border: none; font-size: 18px; cursor: pointer; color: var(--text-light);"
                >
                  ✕
                </button>
              </div>

              ${pwa.isIOS
                ? html`
                    <div style="font-size: 13.5px; line-height: 1.6; color: var(--text); margin-bottom: 16px;">
                      <p style="margin-bottom: 10px;">To install on <b>iPhone / iPad (Safari)</b>:</p>
                      <ol style="padding-left: 20px; margin-bottom: 12px;">
                        <li style="margin-bottom: 6px;">Tap the <b>Share</b> button <span style="font-size: 14px;">(⎋)</span> in Safari bottom toolbar.</li>
                        <li style="margin-bottom: 6px;">Scroll down and select <b>Add to Home Screen</b>.</li>
                        <li>Tap <b>Add</b> in the top right corner.</li>
                      </ol>
                    </div>
                  `
                : html`
                    <div style="font-size: 13.5px; line-height: 1.6; color: var(--text); margin-bottom: 16px;">
                      <p style="margin-bottom: 10px;">To install on <b>Android / Chrome / Desktop</b>:</p>
                      <ol style="padding-left: 20px; margin-bottom: 12px;">
                        <li style="margin-bottom: 6px;">Tap or click the browser menu <span style="font-weight: 700;">(⋮)</span> in the top-right corner.</li>
                        <li style="margin-bottom: 6px;">Select <b>Install app</b> or <b>Add to Home screen</b>.</li>
                        <li>Confirm <b>Install</b> to place the app icon on your home screen or desktop.</li>
                      </ol>
                    </div>
                  `}

              <div style="font-size: 12.5px; color: #0369a1; background: #f0f9ff; border: 1px solid #bae6fd; padding: 10px 12px; border-radius: 8px; margin-bottom: 16px;">
                ✓ <b>Instant Native Experience:</b> Runs full-screen without browser address bars and saves camp collections even when disconnected.
              </div>

              <div style="display: flex; gap: 8px; justify-content: flex-end;">
                ${pwa.hasPrompt
                  ? html`
                      <button
                        type="button"
                        class="btn btn-primary"
                        onClick=${async () => {
                          setShowInstallModal(false);
                          await promptInstall();
                        }}
                        style="padding: 8px 14px; font-size: 13px;"
                      >
                        📲 Install Now
                      </button>
                    `
                  : ''}
                <button
                  type="button"
                  class="btn btn-secondary"
                  onClick=${() => setShowInstallModal(false)}
                  style="padding: 8px 16px; font-size: 13px;"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        `
      : ''}
  `;
}

export function BottomNav({ activeRoute }) {
  const [user, setUser] = useState(() => currentUser.value);
  useEffect(() => {
    return currentUser.subscribe ? currentUser.subscribe(setUser) : undefined;
  }, []);

  if (!user) return null;

  const role = user.role;
  const current = activeRoute || window.location.hash || '#/';

  const isActive = (hash) => {
    if (hash === '#/' && (current === '#/' || current === '' || current === '#/dashboard')) return 'active';
    return current.startsWith(hash) && hash !== '#/' ? 'active' : '';
  };

  let items = [];

  if (role === 'super_admin') {
    items = [
      { href: '#/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { href: '#/teams', label: 'Teams', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
      { href: '#/members', label: 'Members', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { href: '#/finance', label: 'Finance', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      { href: '#/reports', label: 'Reports', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' }
    ];
  } else if (role === 'usthad') {
    items = [
      { href: '#/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { href: '#/teams', label: 'Teams', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
      { href: '#/transfers', label: 'Transfers', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
      { href: '#/finance', label: 'Finance', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      { href: '#/reports', label: 'Reports', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' }
    ];
  } else if (role === 'team_leader') {
    items = [
      { href: '#/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { href: '#/members', label: 'Members', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { href: '#/stock', label: 'Stock', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
      { href: '#/transfers', label: 'Transfers', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
      { href: '#/profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' }
    ];
  } else {
    // team_member
    items = [
      { href: '#/', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { href: '#/distribution', label: 'Distribute', icon: 'M12 4v16m8-8H4' },
      { href: '#/collections', label: 'Collect', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
      { href: '#/transfers', label: 'Handover', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
      { href: '#/profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' }
    ];
  }

  return html`
    <div class="bottom-nav">
      ${items.map(
        (item) => html`
          <a key=${item.href} href=${item.href} class="bottom-nav-item ${isActive(item.href)}">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d=${item.icon}></path>
            </svg>
            <span>${item.label}</span>
          </a>
        `
      )}
    </div>
  `;
}
