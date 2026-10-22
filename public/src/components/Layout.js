import { currentUser } from '../store/auth.js';
import { syncStatus, syncAll } from '../services/sync.js';

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

  useEffect(() => {
    const unsubUser = currentUser.subscribe ? currentUser.subscribe(setUser) : null;
    const unsubStatus = syncStatus.subscribe ? syncStatus.subscribe(setStatus) : null;
    return () => {
      if (unsubUser) unsubUser();
      if (unsubStatus) unsubStatus();
    };
  }, []);

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
      <div style="display: flex; align-items: center; gap: 10px;">
        <button class="navbar-btn" onClick=${() => syncAll()} title="Sync Status" style="font-size: 13px; display: flex; align-items: center; gap: 6px;">
          ${getSyncDot()}
          ${status.pendingCount > 0 ? html`<span style="font-size: 11px; font-weight: 700; background: rgba(0,0,0,0.3); padding: 1px 6px; border-radius: 10px;">${status.pendingCount}</span>` : ''}
        </button>
        <a href="#/settings" style="text-decoration: none; color: white;">
          <div class="list-avatar" style="width: 32px; height: 32px; font-size: 13px; background: rgba(255,255,255,0.2); color: white;">
            ${user && user.profilePhoto ? html`<img src="${user.profilePhoto}" alt="Avatar" />` : (user ? user.fullName.charAt(0).toUpperCase() : 'U')}
          </div>
        </a>
      </div>
    </nav>
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
      { href: '#/stock', label: 'Stock', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
      { href: '#/finance', label: 'Finance', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      { href: '#/reports', label: 'Reports', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' }
    ];
  } else if (role === 'usthad') {
    items = [
      { href: '#/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { href: '#/teams', label: 'Teams', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
      { href: '#/transfers', label: 'Transfers', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
      { href: '#/finance', label: 'Finance', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      { href: '#/reports', label: 'Reports', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { href: '#/settings', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' }
    ];
  } else if (role === 'team_leader') {
    items = [
      { href: '#/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { href: '#/members', label: 'Members', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { href: '#/stock', label: 'Stock', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
      { href: '#/transfers', label: 'Transfers', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
      { href: '#/reports', label: 'Reports', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' }
    ];
  } else {
    // team_member
    items = [
      { href: '#/', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { href: '#/distribution', label: 'Distribute', icon: 'M12 4v16m8-8H4' },
      { href: '#/collections', label: 'Collect', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
      { href: '#/transfers', label: 'Handover', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
      { href: '#/areas', label: 'Areas', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' }
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
