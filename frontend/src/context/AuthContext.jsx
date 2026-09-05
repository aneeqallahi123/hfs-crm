import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setAccessToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Token is persisted in localStorage; /auth/me validates it is still good
    api.auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => setAccessToken(null)) // token invalid/expired — clear it
      .finally(() => setLoading(false));
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
