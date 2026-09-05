import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import EditableText from '../components/EditableText.jsx';
import { today, daysBetween, progressTier, noProgressDays, engMetrics, healthOf } from '../lib/metrics.js';

function Stat({ label, value }) {
  return (
    <div className="px-4 py-4 text-center">
      <div className="text-2xl font-semibold text-ink tabular-nums">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

const inPeriod = (dateStr, period, td) => {
  if (!dateStr) return false;
  const d = daysBetween(dateStr, td);
  if (d == null || d < 0) return false;
  if (period === 'today') return d === 0;
  if (period === 'week') return d <= 6;
  if (period === 'month') return d <= 29;
  return true;
};

const isoDay = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

const PERIODS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All time']];
const EV = {
  completed: { label: 'Complete', cls: 'text-green bg-fog border-tint' },
  received: { label: 'Received', cls: 'text-ink bg-fog border-tint' },
  queried: { label: 'Queried', cls: 'text-deep bg-fog border-tint' },
  requested: { label: 'Requested', cls: 'text-slate-500 bg-fog border-tint' },
  added: { label: 'Added', cls: 'text-slate-500 bg-paper border-tint' },
};
const LOG_TYPE = {
  'item.status': (ev) => ev.toVal === 'Completed' ? 'completed' : ev.toVal === 'Requested' ? 'requested' : ev.toVal === 'Under Review' ? 'received' : null,
  'item.queried': () => 'queried', 'item.file': () => 'received', 'item.added': () => 'added',
};

export default function Person() {
  const { name } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [person, setPerson] = useState(null);
  const [clients, setClients] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [itemsByEng, setItemsByEng] = useState({});
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');
  const td = today();

  async function load() {
    setLoading(true);
    try {
      const [team, c, e, evs] = await Promise.all([
        api.team.list(), api.clients.list(), api.engagements.list(), api.events.list({ limit: 500 }).catch(() => ({ events: [] })),
      ]);
      setPerson((Array.isArray(team) ? team : []).find((p) => p.name === name) || null);
      setClients(Array.isArray(c) ? c : []);
      const eg = Array.isArray(e) ? e : [];
      setEngagements(eg);
      setEvents(Array.isArray(evs) ? evs : (evs?.events || []));
      const lists = await Promise.all(eg.map((x) => api.items.list(x.id).catch(() => [])));
      const im = {};
      eg.forEach((x, i) => { im[x.id] = Array.isArray(lists[i]) ? lists[i] : []; });
      setItemsByEng(im);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [name]);

  async function rename(v) {
    const nm = v.trim();
    if (!person || !nm || nm === name) return;
    try {
      await api.team.update(person.id, { name: nm });
      navigate(`/team/${encodeURIComponent(nm)}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (loading) return <div className="stagger p-8 max-w-4xl"><div className="text-sm text-slate-400">Loading…</div></div>;

  const engs = engagements.filter((e) => e.incharge === name);
  const clientOf = (e) => clients.find((c) => c.id === e.clientId);
  const items = [];
  for (const e of engagements) for (const it of (itemsByEng[e.id] || [])) if (it.headIncluded && (it.owner || e.incharge) === name) items.push({ it, e });
  const clientCount = new Set(engs.map((e) => e.clientId)).size;
  const active = items.filter(({ it }) => it.status !== 'NA');
  const doneAll = active.filter(({ it }) => it.status === 'Completed').length;
  const open = active.length - doneAll;
  const pct = active.length ? Math.round((doneAll / active.length) * 100) : 0;
  const flagged = active.filter(({ it }) => progressTier(it)).length;
  const oldest = active.reduce((m, { it }) => { const d = noProgressDays(it); return d != null && d > m ? d : m; }, 0);

  const perf = {
    completed: items.filter(({ it }) => it.status === 'Completed' && inPeriod(it.statusSince, period, td)).length,
    received: items.filter(({ it }) => inPeriod(it.dateReceived, period, td)).length,
    queried: items.filter(({ it }) => it.dateQueried && inPeriod(it.dateQueried, period, td)).length,
  };
  const turns = items.filter(({ it }) => it.status === 'Completed' && it.dateReceived && it.statusSince).map(({ it }) => daysBetween(it.dateReceived, it.statusSince)).filter((d) => d != null && d >= 0);
  const avgTurn = turns.length ? Math.round(turns.reduce((a, b) => a + b, 0) / turns.length) : null;

  const activeDaySet = new Set();
  for (const ev of events) if (ev.by === name && daysBetween(ev.day, td) <= 29 && daysBetween(ev.day, td) >= 0) activeDaySet.add(ev.day);
  for (const { it } of items) [it.dateRequested, it.dateReceived, it.dateQueried, it.status === 'Completed' ? it.statusSince : null].forEach((d) => { if (d && daysBetween(d, td) <= 29 && daysBetween(d, td) >= 0) activeDaySet.add(d); });
  const activeDays = activeDaySet.size;

  const days = [...Array(14)].map((_, i) => { const dt = new Date(); dt.setDate(dt.getDate() - (13 - i)); return isoDay(dt); });
  const perDay = days.map((day) => ({
    day,
    completed: items.filter(({ it }) => it.status === 'Completed' && it.statusSince === day).length,
    received: items.filter(({ it }) => it.dateReceived === day).length,
  }));
  const maxV = Math.max(1, ...perDay.map((d) => Math.max(d.completed, d.received)));

  const eventList = [];
  for (const { it, e } of items) {
    const c = clientOf(e);
    const ctx = { label: it.p, sub: `${c ? c.name : ''} · FY${e.year}`, eid: e.id };
    if (it.dateRequested) eventList.push({ date: it.dateRequested, type: 'requested', ...ctx });
    if (it.dateReceived) eventList.push({ date: it.dateReceived, type: 'received', ...ctx });
    if (it.dateQueried) eventList.push({ date: it.dateQueried, type: 'queried', ...ctx });
    if (it.status === 'Completed' && it.statusSince) eventList.push({ date: it.statusSince, type: 'completed', ...ctx });
  }
  const myItemIds = new Set(items.map(({ it }) => it.id));
  const seen = new Set(eventList.map((ev) => `${ev.date}|${ev.type}|${ev.label}`));
  for (const ev of events) {
    const mine = ev.by === name || (ev.entity === 'item' && myItemIds.has(ev.entityId));
    if (!mine || !LOG_TYPE[ev.type]) continue;
    const t = LOG_TYPE[ev.type](ev);
    if (!t) continue;
    const key = `${ev.day}|${t}|${ev.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = ev.clientId && clients.find((x) => x.id === ev.clientId);
    const e = ev.engagementId && engagements.find((x) => x.id === ev.engagementId);
    eventList.push({ date: ev.day, type: t, label: ev.label, sub: c ? `${c.name}${e ? ' · FY' + e.year : ''}` : '', eid: e ? e.id : null });
  }
  const feed = eventList.filter((ev) => inPeriod(ev.date, period, td)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const feedByDay = [];
  for (const ev of feed) {
    let g = feedByDay.find((x) => x.date === ev.date);
    if (!g) { g = { date: ev.date, items: [] }; feedByDay.push(g); }
    g.items.push(ev);
  }
  const periodLabel = { today: 'today', week: 'in the last 7 days', month: 'in the last 30 days', all: 'all time' }[period];
  const relDay = (d) => { const n = daysBetween(d, td); return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : d; };

  return (
    <div className="stagger p-8 max-w-4xl">
      <button onClick={() => navigate('/team')} className="text-xs text-slate-400 hover:text-ink mb-3">← Back to team</button>
      <header className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full border border-tint text-ink flex items-center justify-center text-lg font-medium shrink-0">
          {name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <EditableText value={name} onSave={rename} className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em] w-full -ml-1.5" />
          <div className="mt-3 h-px w-12 bg-green" />
          <p className="text-sm text-slate-500 mt-1">
            {person?.role || '—'} · in-charge of {clientCount} client{clientCount === 1 ? '' : 's'} ·{' '}
            <button onClick={() => navigate('/tasks')} className="text-green hover:underline underline-offset-2">open tasks</button>
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold text-ink tabular-nums">{pct}%</div>
          <div className="text-xs text-slate-400">{doneAll}/{active.length} complete</div>
        </div>
      </header>

      <div className="grid grid-cols-4 bg-fog rounded-lg divide-x divide-tint overflow-hidden mb-8">
        <Stat label="Open" value={open} />
        <Stat label="Flagged" value={flagged} />
        <Stat label="Oldest, days" value={oldest} />
        <Stat label="Active days / 30" value={activeDays} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-xl font-medium text-ink">Performance and activity</h2>
        <div className="flex gap-1">
          {PERIODS.map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} className={`text-xs px-2.5 py-1 rounded-md transition-colors ${period === k ? 'bg-deep text-paper' : 'text-slate-500 hover:bg-fog'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="bg-paper border border-tint rounded-xl p-5 mb-6">
        <div className="grid grid-cols-4 gap-4">
          <div><div className="text-2xl font-semibold text-green tabular-nums">{perf.completed}</div><div className="text-xs text-slate-500 mt-0.5">Completed</div></div>
          <div><div className="text-2xl font-semibold text-ink tabular-nums">{perf.received}</div><div className="text-xs text-slate-500 mt-0.5">Received</div></div>
          <div><div className="text-2xl font-semibold text-deep tabular-nums">{perf.queried}</div><div className="text-xs text-slate-500 mt-0.5">Queried</div></div>
          <div><div className="text-2xl font-semibold text-ink tabular-nums">{avgTurn == null ? '—' : avgTurn + 'd'}</div><div className="text-xs text-slate-500 mt-0.5">Avg review time</div></div>
        </div>
      </div>

      <div className="bg-paper border border-tint rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-lg font-medium text-ink">Daily activity — last 14 days</h2>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green" /> completed</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-tint" /> received</span>
          </div>
        </div>
        <div className="flex items-end gap-1 h-24">
          {perDay.map((d) => (
            <div key={d.day} className="flex-1 flex items-end gap-px h-full" title={`${d.day}: ${d.completed} completed, ${d.received} received`}>
              <div className="flex-1 bg-green rounded-t" style={{ height: (d.completed / maxV) * 100 + '%' }} />
              <div className="flex-1 bg-tint rounded-t" style={{ height: (d.received / maxV) * 100 + '%' }} />
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-1">
          {perDay.map((d, i) => <div key={d.day} className="flex-1 text-center text-[9px] text-slate-400">{i % 3 === 0 || i === 13 ? d.day.slice(5) : ''}</div>)}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        <div className="md:col-span-3">
          <div className="bg-paper border border-tint rounded-xl overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-tint bg-fog/60 text-sm font-medium text-ink">
              What {name.split(' ')[0]} did <span className="text-slate-400 font-normal">— {periodLabel}</span>
            </div>
            {feedByDay.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">No recorded activity {periodLabel}.</p>
            ) : (
              <div className="max-h-[520px] overflow-y-auto">
                {feedByDay.map((g) => (
                  <div key={g.date}>
                    <div className="px-5 py-1.5 bg-fog text-xs font-medium text-slate-500 sticky top-0">{relDay(g.date)} <span className="text-slate-300">· {g.items.length}</span></div>
                    <div className="divide-y divide-tint/60">
                      {g.items.map((ev, i) => (
                        <div key={i} onClick={() => ev.eid && navigate(`/engagements/${ev.eid}`)} className={`px-5 py-2 flex items-center gap-3 ${ev.eid ? 'hover:bg-fog cursor-pointer' : ''}`}>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 w-20 text-center ${EV[ev.type].cls}`}>{EV[ev.type].label}</span>
                          <span className="flex-1 text-sm text-ink truncate">{ev.label}</span>
                          <span className="text-xs text-slate-400 truncate w-40 text-right">{ev.sub}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="md:col-span-2">
          <div className="bg-paper border border-tint rounded-xl overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-tint bg-fog/60 text-sm font-medium text-ink">Clients</div>
            {engs.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">Not in charge of any clients yet.</p>
            ) : (
              <div className="divide-y divide-tint/60">
                {engs.map((e) => {
                  const client = clientOf(e);
                  const m = engMetrics({ ...e, items: itemsByEng[e.id] || [] });
                  const h = healthOf(m);
                  return (
                    <div key={e.id} onClick={() => navigate(`/engagements/${e.id}`)} className="px-5 py-2.5 flex items-center gap-3 hover:bg-fog cursor-pointer">
                      <span className="flex-1 min-w-0 text-sm text-ink truncate">{client?.name} <span className="text-slate-400">FY{e.year}</span></span>
                      <span className="text-xs text-slate-500 tabular-nums">{m.pct}%</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${h.cls}`}>{h.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
