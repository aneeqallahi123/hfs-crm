import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { today, daysBetween } from '../lib/metrics.js';

function FilterDropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const reposition = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 6, left: r.left });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    function onScroll() { reposition(); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    function onMouse(e) {
      const inBtn = btnRef.current && btnRef.current.contains(e.target);
      const inPanel = panelRef.current && panelRef.current.contains(e.target);
      if (!inBtn && !inPanel) setOpen(false);
    }
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouse);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouse);
    };
  }, [open, reposition]);

  const selected = options.find((o) => o.value === value);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
          value !== 'all' ? 'bg-deep text-paper border-deep' : 'bg-paper text-ink border-tint hover:bg-fog'
        }`}
      >
        <span>{label}{value !== 'all' && selected ? `: ${selected.label}` : ''}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 9999 }}
          className="bg-paper border border-tint rounded-xl shadow-xl py-1 min-w-[180px]"
        >
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-4 hover:bg-fog ${value === o.value ? 'text-deep font-medium' : 'text-ink'}`}
            >
              <span>{o.label}</span>
              {o.count != null && <span className="font-mono text-xs text-slate-400">{o.count}</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function person(v) { return v || 'unassigned'; }

function describe(ev) {
  const L = ev.label || '';
  switch (ev.type) {
    case 'item.status': return `${L}: ${ev.fromVal} → ${ev.toVal === 'Under Review' ? 'Under review' : ev.toVal}`;
    case 'item.queried': return `${L}: queried — client asked for a corrected file`;
    case 'item.owner': return `${L}: ${person(ev.fromVal)} → ${person(ev.toVal)}`;
    case 'item.received_date': return `${L}: received date changed ${ev.fromVal} → ${ev.toVal || 'blank'}`;
    case 'item.requestable': return `${L}: now ${ev.toVal}`;
    case 'item.added': return `${L}: added to the ledger`;
    case 'item.removed': return `${L}: deleted${ev.fromVal ? " (was " + ev.fromVal + "'s)" : ''}`;
    case 'item.due': return `${L}: due ${ev.fromVal || 'none'} → ${ev.toVal || 'none'}`;
    case 'file.uploaded': return `File uploaded: ${ev.toVal}`;
    case 'engagement.deadline': return `${L}: deadline ${ev.fromVal || 'none'} → ${ev.toVal || 'none'}`;
    case 'engagement.created': return `${L} created (${ev.toVal})`;
    case 'engagement.incharge': return `${L}: in-charge ${person(ev.fromVal)} → ${person(ev.toVal)}`;
    case 'engagement.removed': return `${L} removed`;
    case 'client.added': return `Client added: ${L}`;
    case 'client.renamed': return `Client renamed: ${ev.fromVal} → ${ev.toVal}`;
    case 'client.removed': return `Client removed: ${L}`;
    case 'person.added': return `Joined the team: ${L}${ev.toVal ? ' (' + ev.toVal + ')' : ''}`;
    case 'person.renamed': return `Renamed: ${ev.fromVal} → ${ev.toVal}`;
    case 'person.role': return `${L}: role ${ev.fromVal || '—'} → ${ev.toVal}`;
    case 'person.removed': return `Left the team: ${L}`;
    default: return `${ev.type} ${L}`;
  }
}

function notable(ev) {
  return ev.type === 'item.received_date' || ev.type === 'item.removed' || ev.type === 'engagement.removed' || ev.type === 'engagement.deadline' ||
    (ev.type === 'item.status' && ev.toVal === 'NA') || ev.type === 'item.owner' || ev.type === 'engagement.incharge' || ev.type === 'person.removed';
}

export default function Events() {
  const toast = useToast();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [team, setTeam] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [who, setWho] = useState('all');
  const [days, setDays] = useState(7);
  const td = today();

  useEffect(() => {
    setLoading(true);
    Promise.all([api.clients.list(), api.team.list().catch(() => []), api.events.list({ limit: 500 })])
      .then(([c, t, evs]) => {
        setClients(Array.isArray(c) ? c : []);
        setTeam(Array.isArray(t) ? t : []);
        setEvents(Array.isArray(evs) ? evs : (evs?.events || []));
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  const evs = events.filter((ev) => {
    const d = daysBetween(ev.day, td);
    if (d == null || d < 0 || d > days) return false;
    return who === 'all' || (who === '' ? !ev.by : ev.by === who);
  }).slice().reverse();

  const clientName = (id) => clients.find((c) => c.id === id)?.name || '';
  const byDay = [];
  for (const ev of evs) {
    let g = byDay.find((x) => x.day === ev.day);
    if (!g) { g = { day: ev.day, list: [] }; byDay.push(g); }
    g.list.push(ev);
  }
  const relDay = (d) => { const n = daysBetween(d, td); return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : d; };
  const hhmm = (iso) => { try { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch { return ''; } };
  const DAYS_OPTIONS = [
    { value: 'all', label: 'All time' },
    { value: '1', label: 'Today' },
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
  ];

  const teamOptions = [
    { value: 'all', label: 'Everyone' },
    ...team.map((p) => ({ value: p.name, label: p.name, count: evs.filter((ev) => ev.by === p.name).length })),
    { value: '', label: 'No name', count: evs.filter((ev) => !ev.by).length },
  ];

  const daysValue = days === 3650 ? 'all' : String(days);

  if (loading) return <div className="stagger p-8 max-w-5xl"><div className="text-sm text-slate-400">Loading…</div></div>;

  return (
    <div className="stagger p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Activity</h1>
        <div className="mt-3 h-px w-12 bg-green" />
        <p className="text-sm text-slate-500 mt-1">Every change, in order, under the name it was made with. Reversals, date edits, deletions and reassignments are marked.</p>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <FilterDropdown
          label="Team"
          value={who}
          options={teamOptions}
          onChange={(v) => setWho(v)}
        />
        <FilterDropdown
          label="Timeline"
          value={daysValue}
          options={DAYS_OPTIONS}
          onChange={(v) => setDays(v === 'all' ? 3650 : Number(v))}
        />
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-slate-500 tabular-nums">{evs.length} change{evs.length === 1 ? '' : 's'}</span>
      </div>

      {evs.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 px-1">Nothing recorded for this filter.</p>
      ) : (
        <div className="bg-paper border border-tint rounded-xl overflow-hidden">
          {byDay.map((g) => (
            <div key={g.day}>
              <div className="px-5 py-1.5 bg-fog text-xs font-medium text-slate-500 sticky top-0">{relDay(g.day)} <span className="text-slate-300">· {g.list.length}</span></div>
              <div className="divide-y divide-tint/60">
                {g.list.slice(0, 200).map((ev) => (
                  <div key={ev.id} onClick={() => ev.engagementId && navigate(`/engagements/${ev.engagementId}`)} className={`pl-3 pr-5 py-2 flex items-center gap-3 border-l-4 ${notable(ev) ? 'border-green' : 'border-transparent'} ${ev.engagementId ? 'hover:bg-fog cursor-pointer' : ''}`}>
                    <span className="font-mono text-[11px] text-slate-400 w-10 shrink-0 tabular-nums">{hhmm(ev.at)}</span>
                    <span className="text-xs w-24 shrink-0 truncate text-slate-600" title={ev.by || 'no name set'}>{ev.by || '—'}</span>
                    <span className="flex-1 text-sm text-ink truncate">{describe(ev)}</span>
                    <span className="text-xs text-slate-400 truncate w-40 text-right shrink-0">{clientName(ev.clientId)}</span>
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
