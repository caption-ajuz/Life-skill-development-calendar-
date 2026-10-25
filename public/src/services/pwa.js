// PWA Install State and Installation Prompt Service

let deferredPrompt = null;

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
  isInstallable: false,
  isInstalled: isStandalone(),
  isIOS: isIOSDevice(),
  hasPrompt: false
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chromium from automatically showing the mini-infobar
    e.preventDefault();
    deferredPrompt = e;
    pwaState.value = {
      ...pwaState.value,
      isInstallable: true,
      hasPrompt: true
    };
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
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

  if (!deferredPrompt) {
    return { outcome: 'unavailable' };
  }

  try {
    await deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
      pwaState.value = {
        ...pwaState.value,
        isInstalled: true,
        isInstallable: false,
        hasPrompt: false
      };
      deferredPrompt = null;
    }
    return choiceResult;
  } catch (err) {
    console.warn('Install prompt error:', err);
    return { outcome: 'error', error: err.message };
  }
}
