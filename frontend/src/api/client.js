let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

async function request(method, path, body) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') {
    const refreshed = await refreshToken();
    if (refreshed) return request(method, path, body);
    window.location.href = '/login';
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

async function refreshToken() {
  try {
    const data = await fetch(`${import.meta.env.VITE_API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    }).then(r => r.json());
    if (data.accessToken) {
      setAccessToken(data.accessToken);
      return true;
    }
  } catch {}
  return false;
}

export const api = {
  auth: {
    login: (username, password) => request('POST', '/auth/login', { username, password }),
    logout: () => request('POST', '/auth/logout'),
    me: () => request('GET', '/auth/me'),
  },
  clients: {
    list: (module) => request('GET', `/clients${module ? `?module=${module}` : ''}`),
    get: (id) => request('GET', `/clients/${id}`),
    create: (data) => request('POST', '/clients', data),
    update: (id, data) => request('PATCH', `/clients/${id}`, data),
    delete: (id) => request('DELETE', `/clients/${id}`),
  },
  engagements: {
    list: (clientId, module) => {
      const params = new URLSearchParams();
      if (clientId) params.set('clientId', clientId);
      if (module) params.set('module', module);
      return request('GET', `/engagements?${params}`);
    },
    get: (id) => request('GET', `/engagements/${id}`),
    create: (data) => request('POST', '/engagements', data),
    update: (id, data) => request('PATCH', `/engagements/${id}`, data),
    delete: (id) => request('DELETE', `/engagements/${id}`),
    rollForward: (id) => request('POST', `/engagements/${id}/roll-forward`),
  },
  items: {
    list: (engagementId) => request('GET', `/items?engagementId=${engagementId}`),
    update: (id, data) => request('PATCH', `/items/${id}`, data),
    bulkUpdate: (updates) => request('PATCH', '/items/bulk', { updates }),
    addAdhoc: (data) => request('POST', '/items/adhoc', data),
    delete: (id) => request('DELETE', `/items/${id}`),
  },
  inbox: {
    list: (engagementId) => request('GET', engagementId ? `/inbox?engagementId=${engagementId}` : '/inbox'),
    assign: (fileId, itemId) => request('PATCH', `/inbox/${fileId}/assign`, { itemId }),
    unassign: (fileId) => request('PATCH', `/inbox/${fileId}/assign`, { itemId: null }),
  },
  documents: {
    upload: (formData) => fetch(`${import.meta.env.VITE_API_URL}/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
      body: formData,
    }).then(r => r.json()),
    downloadUrl: (fileId) => request('GET', `/documents/${fileId}/download`),
    delete: (fileId) => request('DELETE', `/documents/${fileId}`),
  },
  team: {
    list: () => request('GET', '/team'),
    create: (data) => request('POST', '/team', data),
    update: (id, data) => request('PATCH', `/team/${id}`, data),
    deactivate: (id) => request('DELETE', `/team/${id}`),
  },
  events: {
    list: (params) => request('GET', `/events?${new URLSearchParams(params)}`),
  },
};
