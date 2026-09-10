import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { today, isAdhoc, progressTier, daysBetween, ageLabel, FLAG_DAYS } from '../lib/metrics.js';

const ROLE_OPTIONS = ['partner', 'manager', 'student'];

export default function Team() {
  const toast = useToast();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [itemsByEng, setItemsByEng] = useState({});
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [confirmRemove, setConfirmRemove] = useState(null);
  const td = today();

  async function load() {
    setLoading(true);
    try {
      const [m, e, evs] = await Promise.all([
        api.team.list(), api.engagements.list(), api.events.list({ limit: 500 }).catch(() => ({ events: [] })),
      ]);
      const mm = Array.isArray(m) ? m : [];
      const eg = Array.isArray(e) ? e : [];
      setMembers(mm);
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

  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim() || !username.trim() || !password.trim()) return;
    try {
      await api.team.create({ name: name.trim(), username: username.trim().toLowerCase(), password, role });
      toast(`${name.trim()} joined the team`, 'success');
      setName(''); setUsername(''); setPassword(''); setRole('student'); setAdding(false);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function setMemberRole(id, r) {
    try { await api.team.update(id, { role: r }); load(); } catch (err) { toast(err.message, 'error'); }
  }

  async function remove(m) {
    try { await api.team.deactivate(m.id); toast(`${m.name} removed from the team`, 'info'); setConfirmRemove(null); load(); }
    catch (err) { toast(err.message, 'error'); }
  }

  function loadFor(pname) {
    const engs = engagements.filter((e) => e.incharge === pname);
    const clientIds = new Set(engs.map((e) => e.clientId));
    let total = 0, done = 0, review = 0, flagged = 0, doneToday = 0, openTasks = 0;
    for (const e of engagements) {
      for (const it of (itemsByEng[e.id] || [])) {
        if (!it.headIncluded || it.status === 'NA') continue;
        if ((it.owner || e.incharge) !== pname) continue;
        total++;
        if (it.status === 'Completed') { done++; if (it.statusSince === td) doneToday++; continue; }
        if (it.status === 'Under Review') review++;
        if (progressTier(it)) flagged++;
        if (isAdhoc(it)) openTasks++;
      }
    }
    return { clients: clientIds.size, total, done, review, flagged, doneToday, openTasks, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function lastActive(pname) {
    let best = null;
    for (const ev of events) if (ev.by === pname && (!best || ev.day > best)) best = ev.day;
    if (best) return best;
    for (const e of engagements) for (const it of (itemsByEng[e.id] || [])) {
      if ((it.owner || e.incharge) !== pname) continue;
      for (const d of [it.dateReceived, it.status === 'Completed' ? it.statusSince : null]) if (d && (!best || d > best)) best = d;
    }
    return best;
  }

  function activityLabel(pname) {
    const d = lastActive(pname);
    if (!d) return { text: 'No activity recorded', cls: 'text-slate-400' };
    const n = daysBetween(d, td);
    const cls = n >= FLAG_DAYS.urgent ? 'text-deep font-medium' : n >= FLAG_DAYS.flag ? 'text-green' : n >= FLAG_DAYS.watch ? 'text-slate-600' : 'text-slate-400';
    return { text: n <= 0 ? 'Active today' : `Last activity ${ageLabel(n)} ago`, cls };
  }

  const unassignedEngs = engagements.filter((e) => !e.incharge).length;

  if (loading) return <div className="stagger p-8 max-w-4xl"><div className="text-sm text-slate-400">Loading…</div></div>;

  return (
    <div className="stagger p-8 max-w-4xl">
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setConfirmRemove(null)}>
          <div className="bg-paper border border-tint rounded-2xl p-6 shadow-xl max-w-xs w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mb-4">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 5v4M8 11h.01" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="8" r="6.5" stroke="#ef4444" strokeWidth="1.2"/></svg>
            </div>
            <h2 className="text-sm font-semibold text-ink mb-1">Remove {confirmRemove.name}?</h2>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">This will remove them from the team. Their past work will remain intact.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmRemove(null)} className="flex-1 text-sm px-4 py-2 rounded-lg font-medium text-ink bg-fog hover:bg-tint border border-tint transition-colors">Cancel</button>
              <button onClick={() => remove(confirmRemove)} className="flex-1 text-sm px-4 py-2 rounded-lg font-medium text-white bg-red-500 hover:bg-red-600 transition-colors">Remove</button>
            </div>
          </div>
        </div>
      )}

      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Team</h1>
          <div className="mt-3 h-px w-12 bg-green" />
        </div>
        {!adding && <button onClick={() => setAdding(true)} className="text-sm px-4 py-2 rounded-md font-medium text-ink bg-paper hover:bg-fog border border-tint transition-colors">Add person</button>}
      </header>

      {adding && (
        <div className="bg-paper border border-tint rounded-xl p-4 mb-6">
          <div className="flex items-end gap-2 mb-3">
            <label className="flex-1 text-xs font-medium text-slate-500">
              Name
              <input autoFocus value={name} onChange={(e) => { setName(e.target.value); if (!username) setUsername(e.target.value.trim().toLowerCase().replace(/\s+/g, '.')); }} placeholder="e.g. Ali Raza" className="w-full mt-1 border border-tint rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green" />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Role
              <select value={role} onChange={(e) => setRole(e.target.value)} className="block mt-1 border border-tint rounded-md px-3 py-2 text-sm bg-paper focus:outline-none focus:border-green">
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex-1 text-xs font-medium text-slate-500">
              Username <span className="text-slate-400 font-normal">(used to log in)</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. ali.raza" className="w-full mt-1 border border-tint rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green font-mono" />
            </label>
            <label className="flex-1 text-xs font-medium text-slate-500">
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(false); }} placeholder="Set initial password" className="w-full mt-1 border border-tint rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green" />
            </label>
            <button onClick={add} disabled={!name.trim() || !username.trim() || !password.trim()} className="text-sm px-4 py-2 rounded-md font-medium bg-green text-paper hover:bg-deep disabled:opacity-40 transition-colors">Add</button>
            <button onClick={() => { setAdding(false); setName(''); setUsername(''); setPassword(''); }} className="text-sm px-4 py-2 rounded-md font-medium text-ink bg-paper hover:bg-fog border border-tint transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <div className="border border-dashed border-tint rounded-xl p-10 text-center">
          <p className="text-sm text-slate-500">No one on the team yet.</p>
          <p className="text-xs text-slate-400 mt-1 mb-3">Add the manager and the students, then assign each client an in-charge.</p>
          <button onClick={() => setAdding(true)} className="text-sm px-4 py-2 rounded-md font-medium bg-green text-paper hover:bg-deep transition-colors">Add first person</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {members.filter((m) => m.active !== false).map((p) => {
            const L = loadFor(p.name);
            const a = activityLabel(p.name);
            return (
              <div key={p.id} onClick={() => navigate(`/team/${encodeURIComponent(p.name)}`)} className="bg-paper border border-tint rounded-xl p-5 hover:border-green cursor-pointer transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full border border-tint text-ink flex items-center justify-center text-sm font-medium shrink-0">
                    {p.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 capitalize">{p.role}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-semibold text-ink tabular-nums">{L.total}</span>
                      <span className="text-xs text-slate-400">tasks</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-fog px-2 py-0.5 rounded-full">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5"/></svg>
                        {L.clients} {L.clients === 1 ? 'client' : 'clients'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-tint flex justify-between items-center">
                  <span className={`text-xs ${a.cls}`}>{a.text}</span>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmRemove(p); }} className="text-[11px] font-medium text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors">Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
