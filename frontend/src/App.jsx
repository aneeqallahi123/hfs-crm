import React, { useState, useEffect } from 'react';
import { api, setAccessToken } from './api/client.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Attempt silent refresh on mount
    api.auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    const { username, password } = Object.fromEntries(new FormData(e.target));
    try {
      const { user, accessToken } = await api.auth.login(username, password);
      setAccessToken(accessToken);
      setUser(user);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleLogout() {
    await api.auth.logout();
    setAccessToken(null);
    setUser(null);
  }

  if (loading) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Loading…</div>;

  if (!user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
          <h2 style={{ margin: 0 }}>HFC CRM</h2>
          <input name="username" placeholder="Username" required style={{ padding: 8, fontSize: 14 }} />
          <input name="password" type="password" placeholder="Password" required style={{ padding: 8, fontSize: 14 }} />
          <button type="submit" style={{ padding: '8px 16px', fontSize: 14 }}>Sign in</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>HFC CRM — {user.name} ({user.role})</h2>
        <button onClick={handleLogout}>Sign out</button>
      </div>
      <p style={{ color: '#666' }}>
        Backend connected. Frontend component migration from the existing HTML file happens next.
      </p>
    </div>
  );
}
