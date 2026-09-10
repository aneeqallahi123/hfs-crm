import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { today, daysBetween, progressTier, engMetrics, healthOf } from '../lib/metrics.js';

const ROLE_OPTIONS = ['partner', 'manager', 'student'];

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

function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-paper border border-tint rounded-xl p-6 shadow-lg max-w-sm w-full mx-4">
        <h2 className="text-base font-semibold text-ink mb-1">{title}</h2>
        <p className="text-sm text-slate-500 mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="text-sm px-4 py-2 rounded-md font-medium text-ink bg-paper hover:bg-fog border border-tint transition-colors">Cancel</button>
          <button onClick={onConfirm} className="text-sm px-4 py-2 rounded-md font-medium text-paper bg-red-500 hover:bg-red-600 transition-colors">Remove</button>
        </div>
      </div>
    </div>
  );
}

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

  // Edit profile modal
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const td = today();

  async function load() {
    setLoading(true);
    try {
      const [team, c, e, evs] = await Promise.all([
        api.team.list(), api.clients.list(), api.engagements.list(), api.events.list({ limit: 500 }).catch(() => ({ events: [] })),
      ]);
      const p = (Array.isArray(team) ? team : []).find((p) => p.name === name) || null;
      setPerson(p);
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

  function openEdit() {
    if (!person) return;
    setEditName(person.name);
    setEditRole(person.role || 'student');
    setEditUsername(person.username || '');
    setEditPassword('');
    setShowPw(false);
    setEditOpen(true);
  }

  async function saveProfile() {
    if (!person || !editName.trim()) return;
    const updates = {};
    if (editName.trim() !== person.name) updates.name = editName.trim();
    if (editRole !== person.role) updates.role = editRole;
    if (editUsername.trim() && editUsername.trim() !== person.username) updates.username = editUsername.trim().toLowerCase();
    if (editPassword) updates.password = editPassword;
    if (!Object.keys(updates).length) { setEditOpen(false); return; }
    try {
      await api.team.update(person.id, updates);
      toast('Profile updated', 'success');
      setEditOpen(false);
      if (updates.name) navigate(`/team/${encodeURIComponent(updates.name)}`);
      else load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function removePerson() {
    if (!person) return;
    try {
      await api.team.deactivate(person.id);
      toast(`${person.name} removed from the team`, 'info');
      navigate('/team');
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

  // Performance metrics (current snapshot)
  const openTasks = active.filter(({ it }) => it.status === 'No progress').length;
  const awaited = active.filter(({ it }) => it.status === 'Requested' && !it.queried).length;
  const flagged = active.filter(({ it }) => progressTier(it)).length;
  const completed = active.filter(({ it }) => it.status === 'Completed').length;

  // Activity chart — last 14 days
  const days = [...Array(14)].map((_, i) => { const dt = new Date(); dt.setDate(dt.getDate() - (13 - i)); return isoDay(dt); });
  const perDay = days.map((day) => ({
    day,
    completed: items.filter(({ it }) => it.status === 'Completed' && it.statusSince === day).length,
    received: items.filter(({ it }) => it.dateReceived === day).length,
  }));
  const maxV = Math.max(1, ...perDay.map((d) => Math.max(d.completed, d.received)));

  // Activity feed (period-filtered)
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
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="stagger p-8 max-w-4xl">
      {/* Edit Profile Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-paper border border-tint rounded-xl p-6 shadow-xl w-full max-w-md mx-4">
            <h2 className="font-serif text-lg font-medium text-ink mb-5">Edit Profile</h2>
            <div className="flex flex-col gap-4">
              <label className="text-xs font-medium text-slate-500">
                Name
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full mt-1 border border-tint rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green" />
              </label>
              <label className="text-xs font-medium text-slate-500">
                Role
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="w-full mt-1 border border-tint rounded-md px-3 py-2 text-sm bg-paper focus:outline-none focus:border-green">
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-500">
                Username
                <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className="w-full mt-1 border border-tint rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-green" />
              </label>
              <label className="text-xs font-medium text-slate-500">
                New password <span className="font-normal text-slate-400">(leave blank to keep current)</span>
                <div className="relative mt-1">
                  <input type={showPw ? 'text' : 'password'} value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Enter new password" className="w-full border border-tint rounded-md px-3 py-2 pr-16 text-sm focus:outline-none focus:border-green" />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-ink px-1 py-0.5 rounded transition-colors">
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button onClick={() => { setEditOpen(false); setConfirmRemove(true); }} className="text-sm font-medium text-red-500 hover:text-red-600 transition-colors">
                Remove person
              </button>
              <div className="flex gap-2">
                <button onClick={() => setEditOpen(false)} className="text-sm px-4 py-2 rounded-md font-medium text-ink bg-paper hover:bg-fog border border-tint transition-colors">Cancel</button>
                <button onClick={saveProfile} disabled={!editName.trim()} className="text-sm px-4 py-2 rounded-md font-medium bg-green text-paper hover:bg-deep disabled:opacity-40 transition-colors">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Remove Modal */}
      {confirmRemove && (
        <ConfirmModal
          title={`Remove ${person?.name}?`}
          message="This will remove them from the team. Their past work will remain intact."
          onConfirm={removePerson}
          onCancel={() => { setConfirmRemove(false); setEditOpen(true); }}
        />
      )}

      <button onClick={() => navigate('/team')} className="text-xs text-slate-400 hover:text-ink mb-4">← Back to team</button>

      {/* Header */}
      <header className="flex items-start gap-4 mb-8">
        <div className="w-14 h-14 rounded-full border border-tint text-ink flex items-center justify-center text-lg font-medium shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">{name}</h1>
          <div className="mt-2 h-px w-12 bg-green" />
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs font-medium text-slate-500 capitalize bg-fog border border-tint px-2.5 py-1 rounded-full">
              {person?.role || '—'}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-fog border border-tint px-2.5 py-1 rounded-full">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/></svg>
              {clientCount} {clientCount === 1 ? 'client' : 'clients'}
            </span>
            <button onClick={() => navigate('/tasks')} className="inline-flex items-center gap-1 text-xs font-medium text-green hover:text-deep border border-green/30 hover:border-green px-2.5 py-1 rounded-full transition-colors bg-green/5 hover:bg-green/10">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Open tasks
            </button>
          </div>
        </div>
        <button onClick={openEdit} className="shrink-0 text-sm px-4 py-2 rounded-md font-medium text-ink bg-paper hover:bg-fog border border-tint transition-colors">
          Edit Profile
        </button>
      </header>

      {/* Performance & Activity — combined section */}
      <div className="mb-8">
        <h2 className="font-serif text-xl font-medium text-ink mb-5">Performance &amp; Activity</h2>

        {/* Performance subsection */}
        <div className="mb-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Performance</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Open tasks', value: openTasks, cls: openTasks ? 'text-ink' : 'text-slate-300' },
              { label: 'Awaited from client', value: awaited, cls: awaited ? 'text-amber-500' : 'text-slate-300' },
              { label: 'Flagged', value: flagged, cls: flagged ? 'text-deep font-semibold' : 'text-slate-300' },
              { label: 'Completed', value: completed, cls: completed ? 'text-green' : 'text-slate-300' },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-paper border border-tint rounded-xl px-4 py-4 text-center">
                <div className={`text-2xl font-semibold tabular-nums ${cls}`}>{value}</div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity subsection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Activity</div>
            <div className="flex gap-1 bg-fog rounded-lg p-0.5 border border-tint">
              {PERIODS.map(([k, l]) => (
                <button key={k} onClick={() => setPeriod(k)} className={`text-xs px-2.5 py-1 rounded-md transition-colors ${period === k ? 'bg-paper text-ink shadow-sm border border-tint' : 'text-slate-500 hover:text-ink'}`}>{l}</button>
              ))}
            </div>
          </div>

          {/* Daily chart */}
          <div className="bg-paper border border-tint rounded-xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-ink">Daily activity — last 14 days</span>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green inline-block" /> completed</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-tint inline-block" /> received</span>
              </div>
            </div>
            <div className="flex items-end gap-1 h-24">
              {perDay.map((d) => (
                <div key={d.day} className="flex-1 flex items-end gap-px h-full group" title={`${d.day}: ${d.completed} completed, ${d.received} received`}>
                  <div className="flex-1 bg-green rounded-t transition-all" style={{ height: Math.max(d.completed / maxV * 100, d.completed > 0 ? 4 : 0) + '%' }} />
                  <div className="flex-1 bg-tint rounded-t transition-all" style={{ height: Math.max(d.received / maxV * 100, d.received > 0 ? 4 : 0) + '%' }} />
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-1.5">
              {perDay.map((d, i) => <div key={d.day} className="flex-1 text-center text-[9px] text-slate-400">{i % 3 === 0 || i === 13 ? d.day.slice(5) : ''}</div>)}
            </div>
          </div>

          {/* Activity feed */}
          <div className="bg-paper border border-tint rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-tint bg-fog/60 text-sm font-medium text-ink">
              What {name.split(' ')[0]} did <span className="text-slate-400 font-normal">— {periodLabel}</span>
            </div>
            {feedByDay.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">No recorded activity {periodLabel}.</p>
            ) : (
              <div className="max-h-[480px] overflow-y-auto">
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
      </div>

      {/* Clients list */}
      <div className="bg-paper border border-tint rounded-xl overflow-hidden">
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
  );
}
