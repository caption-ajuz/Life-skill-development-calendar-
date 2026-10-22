// API client with fetch, timeout, auth handling

const TIMEOUT = 15000;

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
      credentials: 'same-origin',
      signal: controller.signal,
      headers: {}
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    }

    const res = await fetch(fullUrl, opts);

    if (res.status === 401) {
      if (url.includes('/api/auth/me')) {
        return { success: false, data: null };
      }
      // Clear auth state and redirect
      const { signals } = await import('../store/auth.js');
      if (signals && signals.currentUser) {
        signals.currentUser.value = null;
      }
      window.location.hash = '#/login';
      throw new Error('Session expired. Please log in again.');
    }

    const json = await res.json();

    if (!res.ok || json.success === false) {
      throw new Error(json.message || json.error || `Request failed (${res.status})`);
    }

    return json;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
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
