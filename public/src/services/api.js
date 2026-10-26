// API client with fetch, timeout, robust token auth handling, and offline fallback

const TIMEOUT = 30000;
const TOKEN_KEY = 'lsc_auth_token';
const USER_KEY = 'lsc_auth_user';

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
  } catch (_) {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch (_) {}
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function setStoredUser(user) {
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
  } catch (_) {}
}

export function clearStoredAuth() {
  setStoredToken(null);
  setStoredUser(null);
}

async function request(method, url, data, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    let fullUrl = url;
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== '') qs.append(k, v);
      }
      const qstr = qs.toString();
      if (qstr) fullUrl += '?' + qstr;
    }

    const opts = {
      method,
      credentials: 'include',
      signal: controller.signal,
      headers: {}
    };

    // Attach Bearer token for iframe/PWA/cross-site compatibility
    const token = getStoredToken();
    if (token) {
      opts.headers['Authorization'] = `Bearer ${token}`;
    }

    if (data && (method === 'POST' || method === 'PUT')) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    }

    const res = await fetch(fullUrl, opts);

    if (res.status === 401) {
      clearStoredAuth();
      if (url.includes('/api/auth/me')) {
        return { success: false, data: null };
      }
      // Clear auth state and redirect to login if not already there
      const { signals } = await import('../store/auth.js');
      if (signals && signals.currentUser) {
        signals.currentUser.value = null;
      }
      if (window.location.hash !== '#/login') {
        window.location.hash = '#/login';
      }
      throw new Error('Session expired. Please log in again.');
    }

    const json = await res.json();

    if (!res.ok || json.success === false) {
      if (json && (json.error === 'Offline - local cache active' || json.message === 'Offline - local cache active' || json.offline)) {
        return {
          success: true,
          offline: true,
          data: json.data || null,
          text: json.text || null,
          metadata: json.metadata || null,
          message: 'Offline - local cache active'
        };
      }
      throw new Error(json.message || json.error || `Request failed (${res.status})`);
    }

    return json;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    if (err.message && err.message.includes('Offline - local cache active')) {
      return {
        success: true,
        offline: true,
        data: null,
        text: null,
        metadata: null,
        message: 'Offline - local cache active'
      };
    }
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error('You are offline. Data will be saved locally and synced when connected.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const api = {
  get(url, params) {
    return request('GET', url, null, params);
  },
  post(url, data) {
    return request('POST', url, data);
  },
  put(url, data) {
    return request('PUT', url, data);
  },
  del(url) {
    return request('DELETE', url);
  }
};

export default api;
