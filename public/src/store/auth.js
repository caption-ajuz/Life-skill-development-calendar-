import api from '../services/api.js';

const { signal, computed } = window.signals;

export const currentUser = signal(null);
export const isLoading = signal(true);
export const isAuthenticated = computed(() => !!currentUser.value);

export async function checkAuth() {
  isLoading.value = true;
  try {
    const res = await api.get('/api/auth/me');
    if (res && res.success && res.data) {
      currentUser.value = res.data;
    } else {
      currentUser.value = null;
    }
  } catch (err) {
    currentUser.value = null;
  } finally {
    isLoading.value = false;
  }
  return currentUser.value;
}

export async function login(credentials) {
  const res = await api.post('/api/auth/login', credentials);
  if (res && res.success && res.data) {
    currentUser.value = res.data.user;
    return res.data.user;
  }
  throw new Error((res && res.error) || 'Login failed.');
}

export async function logout() {
  try {
    await api.post('/api/auth/logout', {});
  } catch (err) {
    console.warn('Logout network notice:', err);
  } finally {
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
