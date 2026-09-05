import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import OwnerSelect from '../components/OwnerSelect.jsx';
import StatusSelect from '../components/StatusSelect.jsx';
import {
  today, isAdhoc, progressTier, noProgressDays, ageLabel, RANK, TIER_STYLE, withStatus,
} from '../lib/metrics.js';

function stageOf(it) {
  if (isAdhoc(it)) return 'adhoc';
  if (it.status === 'Under Review') return 'review';
  if (it.requestable && (it.status === 'Requested' || it.queried)) return 'awaited';
  if (it.requestable) return 'request';
  return 'internal';
}

const STAGES = [['request', 'To request'], ['awaited', 'Awaited'], ['review', 'To review'], ['internal', 'Not started'], ['adhoc', 'Ad-hoc']];

export default function Tasks() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [itemsByEng, setItemsByEng] = useState({});
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [who, setWho] = useState('all');
  const [stage, setStage] = useState('all');
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [add, setAdd] = useState({ title: '', owner: '', clientId: '', due: '' });

  const isStudent = user?.role === 'student';
  const td = today();

  async function load() {
    setLoading(true);
    try {
      const [c, e] = await Promise.all([api.clients.list(), api.engagements.list()]);
      const cl = Array.isArray(c) ? c : [];
      const eg = Array.isArray(e) ? e : [];
      setClients(cl);
      setEngagements(eg);
      const lists = await Promise.all(eg.map((x) => api.items.list(x.id).catch(() => [])));
      const im = {};
      eg.forEach((x, i) => { im[x.id] = Array.isArray(lists[i]) ? lists[i] : []; });
      setItemsByEng(im);
      if (!isStudent) api.team.list().then((t) => setTeam(Array.isArray(t) ? t.filter((m) => m.active !== false) : [])).catch(() => {});
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const rows = [];
  for (const e of engagements) {
    const client = clients.find((c) => c.id === e.clientId);
    for (const it of (itemsByEng[e.id] || [])) {
      if (!it.headIncluded || it.status === 'Completed' || it.status === 'NA') continue;
      rows.push({
        e, client, it, who: it.owner || e.incharge || '', inherited: !it.owner && !!e.incharge,
        stage: stageOf(it), tier: progressTier(it), age: noProgressDays(it),
        title: it.p, sub: `${client?.name || ''} · FY ${e.year} · ${it.sub}${it.due ? ' · due ' + it.due : ''}`,
      });
    }
  }

  const ql = q.trim().toLowerCase();
  const matchWho = (w, r) => w === 'all' || (w === '' ? !r : r === w);
  const filtered = rows.filter((r) => matchWho(who, r.who) && (stage === 'all' || r.stage === stage) &&
    (!ql || r.title.toLowerCase().includes(ql) || r.sub.toLowerCase().includes(ql))
  ).sort((a, b) => {
    const ra = a.tier ? RANK[a.tier] : 0, rb = b.tier ? RANK[b.tier] : 0;
    if (ra !== rb) return rb - ra;
    return (b.age || 0) - (a.age || 0);
  });

  const byWho = {};
  for (const r of filtered) (byWho[r.who] = byWho[r.who] || []).push(r);
  const names = team.map((p) => p.name);
  const groups = [];
  for (const n of names) if (byWho[n]) groups.push({ name: n, list: byWho[n] });
  for (const n of Object.keys(byWho)) if (n && !names.includes(n)) groups.push({ name: n, list: byWho[n] });
  if (byWho['']) groups.push({ name: '', list: byWho[''] });

  const nWho = (w) => rows.filter((r) => matchWho(w, r.who)).length;
  const nStage = (s) => rows.filter((r) => matchWho(who, r.who) && r.stage === s).length;

  async function patch(r, fields) {
    if (!fields || !Object.keys(fields).length) return;
    try {
      await api.items.update(r.it.id, fields);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function submitAdd() {
    if (!add.title.trim() || !add.clientId) return;
    const eng = engagements.find((e) => e.clientId === add.clientId);
    if (!eng) { toast('That client has no engagement to attach this to yet', 'error'); return; }
    try {
      await api.items.addAdhoc({ engagementId: eng.id, p: add.title.trim(), owner: add.owner, due: add.due });
      setAdd({ title: '', owner: '', clientId: '', due: '' });
      toast('Task added', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const chip = (on) => `text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? 'bg-deep text-paper border-deep' : 'text-ink border-tint hover:bg-fog'}`;
  const edgeOf = (tier) => tier ? ({ watch: 'border-tint', flag: 'border-green', urgent: 'border-deep' })[tier] : 'border-transparent';
  const field = 'border border-tint rounded-md px-2 py-1.5 text-sm bg-paper focus:outline-none focus:border-green';

  const done = [];
  for (const e of engagements) for (const it of (itemsByEng[e.id] || [])) {
    if (isAdhoc(it) && it.status === 'Completed' && it.statusSince) {
      const d = Math.round((new Date(td) - new Date(it.statusSince)) / 86400000);
      if (d >= 0 && d <= 30 && matchWho(who, it.owner || e.incharge || '')) done.push({ e, it });
    }
  }
  done.sort((a, b) => (a.it.statusSince < b.it.statusSince ? 1 : a.it.statusSince > b.it.statusSince ? -1 : 0));

  if (loading) return <div className="stagger p-8 max-w-5xl"><div className="text-sm text-slate-400">Loading…</div></div>;

  return (
    <div className="stagger p-8 max-w-5xl">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Tasks</h1>
          <div className="mt-3 h-px w-12 bg-green" />
          <p className="text-sm text-slate-500 mt-1">Every open task, by the person who owns it. A task with no owner belongs to the client's in-charge.</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-3xl font-semibold text-ink tabular-nums">{rows.length}</div>
          <div className="font-mono text-[11px] text-slate-500">open</div>
        </div>
      </header>

      <div className="bg-paper border border-tint rounded-xl px-4 py-3 mb-5 flex flex-wrap items-center gap-2">
        <input value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }} placeholder="Add a task — e.g. chase the signed rep letter" className={`flex-1 min-w-[200px] ${field}`} />
        {!isStudent && (
          <select value={add.owner} onChange={(e) => setAdd({ ...add, owner: e.target.value })} className={`${field} text-xs text-slate-600`}>
            <option value="">owner…</option>
            {team.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        )}
        <select value={add.clientId} onChange={(e) => setAdd({ ...add, clientId: e.target.value })} className={`${field} text-xs text-slate-600`}>
          <option value="">choose client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={add.due} onChange={(e) => setAdd({ ...add, due: e.target.value })} title="Optional due date" className={`${field} text-xs text-slate-600`} />
        <button onClick={submitAdd} disabled={!add.title.trim() || !add.clientId} className="text-sm px-4 py-2 rounded-md font-medium bg-green text-paper hover:bg-deep disabled:opacity-40 transition-colors">Add</button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 px-1">Nothing open. Scope a client's areas to create tasks, or add one above.</p>
      ) : (
        <>
          {isStudent ? (
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs px-2.5 py-1 rounded-full border bg-deep text-paper border-deep">My tasks only</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <button onClick={() => setWho('all')} className={chip(who === 'all')}>Everyone <span className={who === 'all' ? 'text-tint' : 'text-slate-400'}>{nWho('all')}</span></button>
              {team.map((p) => (
                <button key={p.id} onClick={() => setWho(who === p.name ? 'all' : p.name)} className={chip(who === p.name)}>
                  {p.name} <span className={who === p.name ? 'text-tint' : 'text-slate-400'}>{nWho(p.name)}</span>
                </button>
              ))}
              <button onClick={() => setWho(who === '' ? 'all' : '')} className={chip(who === '')}>Unassigned <span className={who === '' ? 'text-tint' : 'text-slate-400'}>{nWho('')}</span></button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mb-5">
            <button onClick={() => setStage('all')} className={chip(stage === 'all')}>All</button>
            {STAGES.map(([k, l]) => (
              <button key={k} onClick={() => setStage(stage === k ? 'all' : k)} className={chip(stage === k)}>{l} <span className={stage === k ? 'text-tint' : 'text-slate-400'}>{nStage(k)}</span></button>
            ))}
            <span className="flex-1" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a task or client" aria-label="Find a task" className="text-sm border border-tint rounded-md px-3 py-1.5 bg-paper w-48 focus:outline-none focus:border-green" />
          </div>

          {groups.length === 0 && <p className="text-sm text-slate-400 py-6 px-1">Nothing matches these filters.</p>}
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.name || '__none'} className="bg-paper border border-tint rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-tint bg-fog/60 flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full border border-tint text-ink flex items-center justify-center text-[11px] font-medium shrink-0">
                    {g.name ? g.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '—'}
                  </span>
                  <span className="text-sm font-medium text-ink flex-1">{g.name || 'Unassigned'}</span>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">{g.list.length}</span>
                  {g.name && !isStudent && <button onClick={() => navigate(`/team/${encodeURIComponent(g.name)}`)} className="text-xs text-green hover:underline underline-offset-2">Record</button>}
                </div>
                <div className="divide-y divide-tint/60">
                  {g.list.slice(0, 80).map((r) => (
                    <div key={r.it.id} className={`pl-3 pr-4 py-2 flex items-center gap-3 hover:bg-fog border-l-4 ${edgeOf(r.tier)}`}>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/engagements/${r.e.id}`)}>
                        <div className="text-sm text-ink truncate">{r.it.p}</div>
                        <div className={`text-xs truncate ${r.it.due && r.it.due < td ? 'text-deep' : 'text-slate-400'}`}>{r.sub}{r.inherited ? ' · via in-charge' : ''}</div>
                      </div>
                      {r.tier && <span className={`text-[10px] tabular-nums shrink-0 ${TIER_STYLE[r.tier].text}`} title="Days since last progress">{ageLabel(r.age)}</span>}
                      {!isStudent && <OwnerSelect value={r.it.owner} team={team} onChange={(v) => patch(r, { owner: v })} />}
                      <StatusSelect it={r.it} onChange={(v) => patch(r, withStatus(r.it, v))} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {done.length > 0 && (
            <div className="mt-6">
              <button onClick={() => setShowDone(!showDone)} className="text-xs text-slate-500 hover:text-ink">
                {showDone ? 'Hide' : 'Show'} ad-hoc tasks completed in the last 30 days ({done.length})
              </button>
              {showDone && (
                <div className="mt-2 bg-paper border border-tint rounded-xl divide-y divide-tint/60">
                  {done.slice(0, 50).map(({ e, it }) => (
                    <div key={it.id} className="px-4 py-2 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-500 truncate line-through">{it.p}</div>
                        <div className="text-xs text-slate-400 truncate">{it.owner || e.incharge || 'unassigned'} · completed {it.statusSince}</div>
                      </div>
                      <button onClick={() => patch({ it, e }, withStatus(it, 'No progress'))} title="Put it back on the list" className="text-xs px-2 py-1 rounded-md text-ink hover:bg-fog border border-tint shrink-0">Reopen</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
