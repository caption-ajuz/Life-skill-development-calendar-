// PWA Install State and Installation Prompt Service

let deferredPrompt = (typeof window !== 'undefined' && window.deferredPWAInstallPrompt) || null;

const isStandalone = () => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
};

const isIOSDevice = () => {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) && !('MSStream' in window);
};

// Check if signals is available from window.signals
const createSignal = (val) => {
  if (window.signals && window.signals.signal) {
    return window.signals.signal(val);
  }
  let v = val;
  const listeners = new Set();
  return {
    get value() { return v; },
    set value(newVal) {
      v = newVal;
      listeners.forEach(fn => fn(v));
    },
    subscribe(fn) {
      listeners.add(fn);
      fn(v);
      return () => listeners.delete(fn);
    }
  };
};

export const pwaState = createSignal({
  isInstallable: !!deferredPrompt,
  isInstalled: isStandalone(),
  isIOS: isIOSDevice(),
  hasPrompt: !!deferredPrompt
});

if (typeof window !== 'undefined') {
  const handlePrompt = (e) => {
    // Prevent Chromium from automatically showing the mini-infobar
    e.preventDefault();
    deferredPrompt = e;
    window.deferredPWAInstallPrompt = e;
    pwaState.value = {
      ...pwaState.value,
      isInstallable: true,
      hasPrompt: true
    };
  };

  window.addEventListener('beforeinstallprompt', handlePrompt);
  window.onPWAInstallPrompt = handlePrompt;

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.deferredPWAInstallPrompt = null;
    pwaState.value = {
      ...pwaState.value,
      isInstallable: false,
      isInstalled: true,
      hasPrompt: false
    };
    if (window.showToast) {
      window.showToast('Life Skill Course app installed successfully!', 'success');
    }
  });

  // Re-check display mode
  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    pwaState.value = {
      ...pwaState.value,
      isInstalled: e.matches
    };
  });
}

export async function promptInstall() {
  if (pwaState.value.isInstalled) {
    return { outcome: 'already_installed' };
  }

  if (pwaState.value.isIOS) {
    return { outcome: 'ios_guide' };
  }

  const promptEvent = deferredPrompt || (typeof window !== 'undefined' && window.deferredPWAInstallPrompt);

  if (!promptEvent) {
    return { outcome: 'unavailable' };
  }

  try {
    await promptEvent.prompt();
    const choiceResult = await promptEvent.userChoice;
    if (choiceResult && choiceResult.outcome === 'accepted') {
      pwaState.value = {
        ...pwaState.value,
        isInstalled: true,
        isInstallable: false,
        hasPrompt: false
      };
      deferredPrompt = null;
      if (typeof window !== 'undefined') window.deferredPWAInstallPrompt = null;
    }
    return choiceResult;
  } catch (err) {
    console.warn('Install prompt error:', err);
    return { outcome: 'unavailable', error: err.message };
  }
}
