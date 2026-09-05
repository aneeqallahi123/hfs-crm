import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

const ACTION_LABELS = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  login: 'Logged in',
  logout: 'Logged out',
};

export default function Events() {
  const toast = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ entityType: '', limit: 100 });

  useEffect(() => {
    const params = {};
    if (filters.entityType) params.entityType = filters.entityType;
    params.limit = filters.limit;
    api.events.list(params)
      .then(data => setEvents(Array.isArray(data) ? data : data.events || []))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [filters]);

  function setFilter(k, v) {
    setLoading(true);
    setFilters(f => ({ ...f, [k]: v }));
  }

  return (
    <div className="stagger p-8 max-w-4xl">
      <header className="mb-6">
        <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Activity</h1>
        <div className="mt-3 h-px w-12 bg-green" />
        <p className="text-sm text-slate-500 mt-1">Audit trail of all changes across the system.</p>
      </header>

      <div className="flex gap-3 mb-5">
        <select
          value={filters.entityType}
          onChange={e => setFilter('entityType', e.target.value)}
          className="border border-tint bg-paper text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green"
        >
          <option value="">All types</option>
          <option value="client">Clients</option>
          <option value="engagement">Engagements</option>
          <option value="item">Items</option>
          <option value="user">Users</option>
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-400">No events found.</p>
      ) : (
        <div className="bg-paper border border-tint rounded-lg overflow-hidden">
          {events.map((ev, i) => (
            <div key={ev.id || i} className="flex items-start gap-4 px-4 py-3.5 border-b border-tint last:border-0 hover:bg-fog transition-colors">
              <div className="shrink-0 pt-0.5">
                <div className="w-7 h-7 rounded-full bg-deep/10 flex items-center justify-center">
                  <span className="text-[11px] font-medium text-deep">{(ev.userName || ev.userId || '?').charAt(0).toUpperCase()}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink">
                  <span className="font-medium">{ev.userName || ev.userId}</span>
                  {' '}<span className="text-slate-500">{ACTION_LABELS[ev.action] || ev.action}</span>
                  {' '}<span className="capitalize">{ev.entityType}</span>
                  {ev.metadata?.name && <span className="text-slate-500"> "{ev.metadata.name}"</span>}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {new Date(ev.createdAt).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
