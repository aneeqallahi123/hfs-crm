import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setAccessToken, refreshToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        // Access token is in-memory only; refresh via cookie first, then fetch user
        await refreshToken();
        const { user } = await api.auth.me();
        setUser(user);
      } catch {}
      setLoading(false);
    }
    restoreSession();
  }, []);

  async function login(username, password) {
    const { user, accessToken } = await api.auth.login(username, password);
    setAccessToken(accessToken);
    setUser(user);
    return user;
  }

  async function logout() {
    await api.auth.logout().catch(() => {});
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
