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

export async function refreshToken() {
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
    list: (module) => request('GET', `/clients${module ? `?module=${module}` : ''}`).then(r => r?.clients ?? r),
    get: (id) => request('GET', `/clients/${id}`).then(r => r?.client ?? r),
    create: (data) => request('POST', '/clients', data).then(r => r?.client ?? r),
    update: (id, data) => request('PATCH', `/clients/${id}`, data).then(r => r?.client ?? r),
    delete: (id) => request('DELETE', `/clients/${id}`),
  },
  engagements: {
    list: (clientId, module) => {
      const params = new URLSearchParams();
      if (clientId) params.set('clientId', clientId);
      if (module) params.set('module', module);
      return request('GET', `/engagements?${params}`).then(r => r?.engagements ?? r);
    },
    get: (id) => request('GET', `/engagements/${id}`).then(r => r?.engagement ?? r),
    create: (data) => request('POST', '/engagements', data).then(r => r?.engagement ?? r),
    update: (id, data) => request('PATCH', `/engagements/${id}`, data).then(r => r?.engagement ?? r),
    delete: (id) => request('DELETE', `/engagements/${id}`),
    rollForward: (id) => request('POST', `/engagements/${id}/roll-forward`).then(r => r?.engagement ?? r),
  },
  items: {
    list: (engagementId) => request('GET', `/items?engagementId=${engagementId}`).then(r => r?.items ?? r),
    update: (id, data) => request('PATCH', `/items/${id}`, data).then(r => r?.item ?? r),
    bulkUpdate: (updates) => request('PATCH', '/items/bulk', { updates }),
    addAdhoc: (data) => request('POST', '/items/adhoc', data).then(r => r?.item ?? r),
    delete: (id) => request('DELETE', `/items/${id}`),
  },
  inbox: {
    list: (engagementId) => request('GET', engagementId ? `/inbox?engagementId=${engagementId}` : '/inbox').then(r => r?.files ?? r),
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
    list: () => request('GET', '/team').then(r => r?.team ?? r),
    create: (data) => request('POST', '/team', data).then(r => r?.user ?? r),
    update: (id, data) => request('PATCH', `/team/${id}`, data).then(r => r?.user ?? r),
    deactivate: (id) => request('DELETE', `/team/${id}`),
  },
  events: {
    list: (params) => request('GET', `/events?${new URLSearchParams(params)}`),
  },
  library: {
    get: (module = 'audit') => request('GET', `/library?module=${module}`).then(r => r?.library ?? r),
    save: (module, library) => request('PUT', `/library/${module}`, { library }),
  },
};
