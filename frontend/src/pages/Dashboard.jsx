import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

function StatCard({ label, value, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`bg-paper border border-tint rounded-lg p-6 text-left transition-colors ${onClick ? 'hover:border-green hover:bg-fog cursor-pointer' : 'cursor-default'}`}
    >
      <div className="text-3xl font-semibold tabular-nums text-ink">{value ?? '—'}</div>
      <div className="text-sm font-medium text-ink mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </button>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.clients.list(),
      api.engagements.list(),
    ]).then(([c, e]) => {
      setClients(Array.isArray(c) ? c : []);
      setEngagements(Array.isArray(e) ? e : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const overdueEngagements = engagements.filter(e => e.deadline && e.deadline < today);

  const recentEngagements = [...engagements]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 8);

  function deadlineLabel(e) {
    if (!e.deadline) return '—';
    if (e.deadline < today) return `Overdue (${e.deadline})`;
    return e.deadline;
  }

  function deadlineColor(e) {
    if (e.deadline && e.deadline < today) return 'text-deep font-medium';
    return 'text-slate-500';
  }

  return (
    <div className="stagger p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">
          Overview
        </h1>
        <div className="mt-3 h-px w-12 bg-green" />
        <p className="text-sm text-slate-500 mt-2">Welcome back, {user?.name}.</p>
      </header>

      {loading ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
            <StatCard
              label="Clients"
              value={clients.length}
              sub="total"
              onClick={() => navigate('/clients')}
            />
            <StatCard
              label="Engagements"
              value={engagements.length}
              sub="active"
              onClick={() => navigate('/clients')}
            />
            <StatCard
              label="Overdue"
              value={overdueEngagements.length}
              sub={overdueEngagements.length > 0 ? 'past deadline' : 'none overdue'}
            />
          </div>

          <section>
            <h2 className="text-sm font-medium text-slate-500 mb-3 uppercase tracking-wide text-[11px]">Recent engagements</h2>
            {recentEngagements.length === 0 ? (
              <p className="text-sm text-slate-400">No engagements yet.</p>
            ) : (
              <div className="bg-paper border border-tint rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-tint bg-fog">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Client</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Year</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Module</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">In-charge</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Deadline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEngagements.map(e => {
                      const client = clients.find(c => c.id === e.clientId);
                      return (
                        <tr
                          key={e.id}
                          onClick={() => navigate(`/engagements/${e.id}`)}
                          className="border-b border-tint last:border-0 hover:bg-fog cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-ink truncate max-w-[160px]">
                            {client?.name || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-slate-600">FY {e.year}</td>
                          <td className="px-4 py-3 text-sm capitalize text-slate-500">{e.module}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{e.incharge || '—'}</td>
                          <td className={`px-4 py-3 text-xs ${deadlineColor(e)}`}>{deadlineLabel(e)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
