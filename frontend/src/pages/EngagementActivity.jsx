import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { today, daysBetween } from '../lib/metrics.js';

function describe(ev) {
  const L = ev.label || '';
  switch (ev.type) {
    case 'item.status':        return `${L}: ${ev.fromVal} → ${ev.toVal === 'Under Review' ? 'Under review' : ev.toVal}`;
    case 'item.queried':       return `${L}: queried — client asked for a corrected file`;
    case 'item.owner':         return `${L}: ${ev.fromVal || 'unassigned'} → ${ev.toVal || 'unassigned'}`;
    case 'item.received_date': return `${L}: received date changed ${ev.fromVal} → ${ev.toVal || 'blank'}`;
    case 'item.requestable':   return `${L}: now ${ev.toVal}`;
    case 'item.added':         return `${L}: added to the ledger`;
    case 'item.removed':       return `${L}: deleted${ev.fromVal ? ` (was ${ev.fromVal}'s)` : ''}`;
    case 'item.due':           return `${L}: due ${ev.fromVal || 'none'} → ${ev.toVal || 'none'}`;
    case 'item.reminder':      return `${L}: reminder sent via WhatsApp`;
    case 'item.file_matched':  return `${L}: file matched${ev.toVal ? ` — ${ev.toVal}` : ''}`;
    case 'item.file_uploaded': return `${L}: file uploaded`;
    case 'item.file_removed':  return `${L}: file removed`;
    case 'item.remarks':       return `${L}: remarks updated`;
    case 'engagement.deadline': return `Deadline ${ev.fromVal || 'none'} → ${ev.toVal || 'none'}`;
    case 'engagement.incharge': return `In-charge → ${ev.toVal || 'unassigned'}`;
    case 'engagement.created':  return `${L} created`;
    default:                   return `${L}: ${ev.type.replace(/^[^.]+\./, '').replace(/_/g, ' ')}`;
  }
}

function notable(ev) {
  return ev.type === 'item.received_date' || ev.type === 'item.removed' ||
    ev.type === 'engagement.deadline' ||
    (ev.type === 'item.status' && ev.toVal === 'NA') ||
    ev.type === 'item.owner' || ev.type === 'engagement.incharge';
}

function hhmm(iso) {
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
}

export default function EngagementActivity() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [engagement, setEngagement] = useState(null);
  const [client, setClient] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const td = today();

  useEffect(() => {
    async function load() {
      try {
        const [eng, evs] = await Promise.all([
          api.engagements.get(id),
          api.events.list({ engagementId: id, limit: 500 }),
        ]);
        setEngagement(eng);
        setEvents(Array.isArray(evs) ? evs : (evs?.events || []));
        if (eng.clientId) api.clients.get(eng.clientId).then(setClient).catch(() => {});
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;

  const sorted = [...events].reverse();
  const byDay = [];
  for (const ev of sorted) {
    let g = byDay.find(x => x.day === ev.day);
    if (!g) { g = { day: ev.day, list: [] }; byDay.push(g); }
    g.list.push(ev);
  }

  const relDay = (d) => {
    const n = daysBetween(d, td);
    return n === 0 ? 'TODAY' : n === 1 ? 'YESTERDAY' : d;
  };

  const clientName = client?.name || '';
  const yearLabel = engagement ? `FY ${engagement.year}` : '';

  return (
    <div className="stagger p-8 max-w-4xl">
      <div className="mb-3 flex items-center gap-1.5 text-xs text-slate-400">
        <button onClick={() => navigate('/')} className="hover:text-slate-600">Clients</button>
        {clientName && (
          <>
            <span>›</span>
            <button onClick={() => navigate(`/clients/${engagement?.clientId}`)} className="hover:text-slate-600">{clientName}</button>
          </>
        )}
        {yearLabel && (
          <>
            <span>›</span>
            <button onClick={() => navigate(`/engagements/${id}`)} className="hover:text-slate-600">{yearLabel}</button>
          </>
        )}
        <span>›</span>
        <span className="text-slate-600">Activity</span>
      </div>

      <header className="mb-6">
        <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Activity</h1>
        <div className="mt-3 h-px w-12 bg-green" />
        <p className="text-sm text-slate-500 mt-1">Who changed what, and when. Marked entries are the ones worth a second look.</p>
      </header>

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 px-1">No activity recorded yet.</p>
      ) : (
        <div className="bg-paper border border-tint rounded-xl overflow-hidden">
          {byDay.map((g) => (
            <div key={g.day}>
              <div className="px-5 py-1.5 bg-fog text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                {relDay(g.day)}
              </div>
              <div className="divide-y divide-tint/60">
                {g.list.map((ev) => (
                  <div
                    key={ev.id}
                    className={`pl-3 pr-5 py-2.5 flex items-center gap-3 border-l-4 ${notable(ev) ? 'border-green' : 'border-transparent'}`}
                  >
                    <span className="font-mono text-[11px] text-slate-400 w-10 shrink-0 tabular-nums">{hhmm(ev.at)}</span>
                    <span className="flex-1 text-sm text-ink truncate">{describe(ev)}</span>
                    <span className="text-xs text-slate-400 shrink-0">{ev.by || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
