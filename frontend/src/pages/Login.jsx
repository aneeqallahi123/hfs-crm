import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { username, password } = Object.fromEntries(new FormData(e.target));
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-fog">
      <div className="bg-paper border border-tint rounded-lg p-8 w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="w-14 h-14 rounded-lg bg-deep flex items-center justify-center mx-auto mb-4">
            <span className="text-paper text-xl font-semibold">HF</span>
          </div>
          <h1 className="text-xl font-semibold text-ink">Hassan Farooq &amp; Co.</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-deep text-sm px-3 py-2 rounded-md">
              {error}
            </div>
          )}
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Username</span>
            <input
              name="username"
              placeholder="username"
              required
              autoComplete="username"
              className="w-full border border-tint bg-paper text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Password</span>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full border border-tint bg-paper text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="bg-green text-paper rounded-md px-4 py-2 text-sm font-medium hover:bg-deep transition-colors disabled:opacity-50 mt-1"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
