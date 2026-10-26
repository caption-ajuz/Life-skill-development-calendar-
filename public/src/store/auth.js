import api, { getStoredToken, setStoredToken, getStoredUser, setStoredUser, clearStoredAuth } from '../services/api.js';

const { signal, computed } = window.signals;

// Initialize currentUser from local cache to prevent flashing or spurious logouts
const initialUser = getStoredUser();
export const currentUser = signal(initialUser);
export const isLoading = signal(!initialUser);
export const isAuthenticated = computed(() => !!currentUser.value);

export async function checkAuth() {
  const token = getStoredToken();
  const cachedUser = getStoredUser() || initialUser;

  if (!token) {
    currentUser.value = null;
    isLoading.value = false;
    return null;
  }

  isLoading.value = true;
  try {
    const res = await api.get('/api/auth/me');
    if (res && res.success && res.data) {
      currentUser.value = res.data;
      setStoredUser(res.data);
      return res.data;
    } else if (res && (res.offline || !navigator.onLine) && cachedUser) {
      currentUser.value = cachedUser;
      return cachedUser;
    } else {
      currentUser.value = null;
      clearStoredAuth();
      return null;
    }
  } catch (err) {
    // If offline, network unreachable, or timeout, preserve cached session
    const isOffline = !navigator.onLine || (err && err.message && (
      err.message.includes('offline') ||
      err.message.includes('Offline') ||
      err.message.includes('timed out') ||
      err.message.includes('fetch')
    ));

    if (isOffline && cachedUser) {
      currentUser.value = cachedUser;
      return cachedUser;
    }
    currentUser.value = null;
    clearStoredAuth();
    return null;
  } finally {
    isLoading.value = false;
  }
}

export async function login(credentials) {
  const res = await api.post('/api/auth/login', credentials);
  if (res && res.success && res.data) {
    if (res.data.token) {
      setStoredToken(res.data.token);
    }
    if (res.data.user) {
      setStoredUser(res.data.user);
      currentUser.value = res.data.user;
    }
    return res.data;
  }
  throw new Error((res && res.error) || 'Login failed.');
}

export async function logout() {
  try {
    await api.post('/api/auth/logout', {});
  } catch (err) {
    console.warn('Logout network notice:', err);
  } finally {
    clearStoredAuth();
    currentUser.value = null;
    window.location.hash = '#/login';
  }
}

export function hasRole(...roles) {
  if (!currentUser.value) return false;
  return roles.includes(currentUser.value.role);
}

export const signals = {
  currentUser,
  isLoading,
  isAuthenticated
};
