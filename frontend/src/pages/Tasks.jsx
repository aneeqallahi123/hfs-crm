import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
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
const TASK_TYPES = ['Number / Financial', 'Information', 'Document'];

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

function StudentTasksView({ user, clients, engagements, itemsByEng, loading }) {
  const navigate = useNavigate();
  const [expandedFirms, setExpandedFirms] = useState({});

  if (loading) return (
    <div className="p-8 max-w-5xl">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-fog rounded w-32" />
        <div className="h-12 bg-fog rounded-xl" />
        <div className="h-64 bg-fog rounded-xl" />
      </div>
    </div>
  );

  // Build firms → assigned engagement years
  const userName = user?.name || '';
  const firmMap = {};
  for (const e of engagements) {
    const items = itemsByEng[e.id] || [];
    const myItems = items.filter((it) => it.headIncluded && it.status !== 'Completed' && it.status !== 'NA' &&
      (it.owner === userName || (!it.owner && e.incharge === userName)));
    if (myItems.length === 0) continue;
    const client = clients.find((c) => c.id === e.clientId);
    if (!client) continue;
    if (!firmMap[client.id]) firmMap[client.id] = { client, years: [] };
    firmMap[client.id].years.push({ e, myItems });
  }
  const firms = Object.values(firmMap).sort((a, b) => a.client.name.localeCompare(b.client.name));
  firms.forEach((f) => f.years.sort((a, b) => b.e.year - a.e.year));

  const totalOpen = firms.reduce((s, f) => s + f.years.reduce((ss, y) => ss + y.myItems.length, 0), 0);

  return (
    <div className="stagger p-8 max-w-5xl">
      <header className="mb-6 flex items-center gap-4">
        <div>
          <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Tasks</h1>
          <div className="mt-2 h-px w-10 bg-green" />
        </div>
        <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-deep to-green text-paper shadow-sm">
          <span className="text-xl font-bold tabular-nums leading-none">{totalOpen}</span>
          <span className="text-[9px] font-medium uppercase tracking-wide opacity-80 mt-0.5">open</span>
        </div>
      </header>

      {firms.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm">No tasks assigned to you.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {firms.map(({ client, years }) => {
            const isOpen = !!expandedFirms[client.id];
            const firmTotal = years.reduce((s, y) => s + y.myItems.length, 0);
            return (
              <section key={client.id} className="bg-paper border border-tint rounded-xl overflow-hidden shadow-sm">
                <button
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-fog/50 transition-colors text-left"
                  onClick={() => setExpandedFirms((p) => ({ ...p, [client.id]: !p[client.id] }))}
                >
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-deep/20 to-green/20 border border-tint flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </span>
                  <span className="text-sm font-medium text-ink flex-1">{client.name}</span>
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-fog border border-tint text-slate-500 tabular-nums">{firmTotal}</span>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="border-t border-tint divide-y divide-tint/60">
                    {years.map(({ e, myItems }) => {
                      const stages = myItems.reduce((acc, it) => { const s = stageOf(it); acc[s] = (acc[s] || 0) + 1; return acc; }, {});
                      return (
                        <button
                          key={e.id}
                          className="w-full px-5 py-3 flex items-center gap-3 hover:bg-fog/40 transition-colors text-left"
                          onClick={() => navigate(`/engagements/${e.id}`)}
                        >
                          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm font-medium text-ink flex-1">FY {e.year}</span>
                          <div className="flex items-center gap-2 text-[11px]">
                            {stages.request > 0 && <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100 font-medium">{stages.request} to request</span>}
                            {stages.awaited > 0 && <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-100 font-medium">{stages.awaited} awaited</span>}
                            {stages.review > 0 && <span className="px-1.5 py-0.5 rounded-md bg-green/10 text-green border border-green/20 font-medium">{stages.review} to review</span>}
                            {stages.internal > 0 && <span className="px-1.5 py-0.5 rounded-md bg-fog text-slate-500 border border-tint font-medium">{stages.internal} not started</span>}
                            {stages.adhoc > 0 && <span className="px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-600 border border-purple-100 font-medium">{stages.adhoc} ad-hoc</span>}
                          </div>
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-fog border border-tint text-slate-500 tabular-nums">{myItems.length}</span>
                          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedPeople, setExpandedPeople] = useState({});
  const [expandedFirms, setExpandedFirms] = useState({});
  const [expandedYears, setExpandedYears] = useState({});
  const [add, setAdd] = useState({ title: '', type: '', owner: '', clientId: '', engagementId: '', due: '' });
  const [addLoading, setAddLoading] = useState(false);

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

  // Engagements for selected client in add modal
  const clientEngagements = engagements.filter((e) => e.clientId === add.clientId);

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
    if (!add.title.trim()) return;
    setAddLoading(true);
    try {
      let engagementId = add.engagementId;
      if (!engagementId && add.clientId) {
        const eng = engagements.find((e) => e.clientId === add.clientId);
        if (!eng) { toast('That client has no engagement to attach this to yet', 'error'); setAddLoading(false); return; }
        engagementId = eng.id;
      }
      if (!engagementId) { toast('Please select a firm to attach this task to', 'error'); setAddLoading(false); return; }
      await api.items.addAdhoc({
        engagementId,
        p: add.title.trim(),
        owner: add.owner,
        due: add.due,
        ...(add.type ? { sub: add.type } : {}),
      });
      setAdd({ title: '', type: '', owner: '', clientId: '', engagementId: '', due: '' });
      setShowAddModal(false);
      toast('Task added', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setAddLoading(false);
    }
  }

  const edgeOf = (tier) => tier ? ({ watch: 'border-amber-300', flag: 'border-green', urgent: 'border-deep' })[tier] : 'border-transparent';

  const done = [];
  for (const e of engagements) for (const it of (itemsByEng[e.id] || [])) {
    if (isAdhoc(it) && it.status === 'Completed' && it.statusSince) {
      const d = Math.round((new Date(td) - new Date(it.statusSince)) / 86400000);
      if (d >= 0 && d <= 30 && matchWho(who, it.owner || e.incharge || '')) done.push({ e, it });
    }
  }
  done.sort((a, b) => (a.it.statusSince < b.it.statusSince ? 1 : a.it.statusSince > b.it.statusSince ? -1 : 0));

  const whoOptions = [
    { value: 'all', label: 'Everyone', count: nWho('all') },
    ...team.map((p) => ({ value: p.name, label: p.name, count: nWho(p.name) })),
    { value: '', label: 'Unassigned', count: nWho('') },
  ];

  const stageOptions = [
    { value: 'all', label: 'All statuses' },
    ...STAGES.map(([k, l]) => ({ value: k, label: l, count: nStage(k) })),
  ];

  if (isStudent) return (
    <StudentTasksView
      user={user}
      clients={clients}
      engagements={engagements}
      itemsByEng={itemsByEng}
      loading={loading}
    />
  );

  if (loading) return (
    <div className="p-8 max-w-5xl">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-fog rounded w-32" />
        <div className="h-12 bg-fog rounded-xl" />
        <div className="h-64 bg-fog rounded-xl" />
      </div>
    </div>
  );

  return (
    <div className="stagger p-8 max-w-5xl">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Tasks</h1>
            <div className="mt-2 h-px w-10 bg-green" />
          </div>
          {/* Open count badge */}
          <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-deep to-green text-paper shadow-sm">
            <span className="text-xl font-bold tabular-nums leading-none">{rows.length}</span>
            <span className="text-[9px] font-medium uppercase tracking-wide opacity-80 mt-0.5">open</span>
          </div>
        </div>
        {!isStudent && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl font-medium bg-deep text-paper hover:opacity-90 transition-opacity shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add task
          </button>
        )}
      </header>

      {/* Filters */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {!isStudent && (
            <FilterDropdown
              label="Team"
              value={who}
              options={whoOptions}
              onChange={setWho}
            />
          )}
          <FilterDropdown
            label="Status"
            value={stage}
            options={stageOptions}
            onChange={setStage}
          />
          <span className="flex-1" />
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tasks or clients…"
              className="text-sm border border-tint rounded-lg pl-8 pr-3 py-1.5 bg-paper w-52 focus:outline-none focus:border-green transition-colors"
            />
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm">Nothing open. Scope a client's areas to create tasks, or add one above.</p>
        </div>
      ) : (
        <>
          {groups.length === 0 && (
            <p className="text-sm text-slate-400 py-6 px-1">Nothing matches these filters.</p>
          )}
          <div className="space-y-3">
            {groups.map((g) => {
              const personKey = g.name || '__none';
              const isPersonOpen = !!expandedPeople[personKey];

              // Build firm → year → tasks hierarchy
              const byFirm = {};
              for (const r of g.list) {
                const firmName = r.client?.name || 'No firm';
                const firmId = r.client?.id || '__nofirm';
                const yearKey = `FY ${r.e.year}`;
                if (!byFirm[firmId]) byFirm[firmId] = { firmName, firmId, byYear: {} };
                if (!byFirm[firmId].byYear[yearKey]) byFirm[firmId].byYear[yearKey] = [];
                byFirm[firmId].byYear[yearKey].push(r);
              }
              const firms = Object.values(byFirm);

              return (
                <section key={personKey} className="bg-paper border border-tint rounded-xl overflow-hidden shadow-sm">
                  {/* Person header — always visible, click to expand */}
                  <button
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-fog/50 transition-colors text-left"
                    onClick={() => setExpandedPeople((p) => ({ ...p, [personKey]: !p[personKey] }))}
                  >
                    <span className="w-8 h-8 rounded-full bg-gradient-to-br from-deep/20 to-green/20 border border-tint text-ink flex items-center justify-center text-[11px] font-semibold shrink-0">
                      {g.name ? g.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '—'}
                    </span>
                    <span className="text-sm font-medium text-ink flex-1">{g.name || 'Unassigned'}</span>
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-fog border border-tint text-slate-500 tabular-nums">{g.list.length}</span>
                    {g.name && !isStudent && (
                      <span
                        onClick={(e) => { e.stopPropagation(); navigate(`/team/${encodeURIComponent(g.name)}`); }}
                        className="text-xs text-green hover:underline underline-offset-2"
                      >Profile</span>
                    )}
                    <svg className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isPersonOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded: firm → year → tasks */}
                  {isPersonOpen && (
                    <div className="border-t border-tint divide-y divide-tint/60">
                      {firms.map(({ firmName, firmId, byYear }) => {
                        const firmKey = `${personKey}__${firmId}`;
                        const isFirmOpen = !!expandedFirms[firmKey];
                        const firmTotal = Object.values(byYear).reduce((s, l) => s + l.length, 0);
                        const years = Object.entries(byYear).sort((a, b) => b[0].localeCompare(a[0]));

                        return (
                          <div key={firmId}>
                            {/* Firm header */}
                            <button
                              className="w-full px-5 py-2.5 flex items-center gap-2 hover:bg-fog/40 transition-colors text-left bg-fog/20"
                              onClick={() => setExpandedFirms((p) => ({ ...p, [firmKey]: !p[firmKey] }))}
                            >
                              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              <span className="text-xs font-medium text-ink flex-1">{firmName}</span>
                              <span className="font-mono text-[10px] text-slate-400 tabular-nums">{firmTotal}</span>
                              <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${isFirmOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>

                            {/* Engagement years */}
                            {isFirmOpen && years.map(([yearKey, list]) => {
                              const yearStateKey = `${firmKey}__${yearKey}`;
                              const isYearOpen = !!expandedYears[yearStateKey];

                              return (
                                <div key={yearKey}>
                                  {/* Year header */}
                                  <button
                                    className="w-full px-8 py-2 flex items-center gap-2 hover:bg-fog/30 transition-colors text-left bg-fog/10"
                                    onClick={() => setExpandedYears((p) => ({ ...p, [yearStateKey]: !p[yearStateKey] }))}
                                  >
                                    <svg className="w-3 h-3 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-[11px] font-medium text-slate-500 flex-1">{yearKey}</span>
                                    <span className="font-mono text-[10px] text-slate-400 tabular-nums">{list.length}</span>
                                    <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${isYearOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </button>

                                  {/* Tasks */}
                                  {isYearOpen && (
                                    <div className="divide-y divide-tint/40">
                                      {list.map((r) => (
                                        <div key={r.it.id} className={`pl-10 pr-4 py-2.5 flex items-center gap-3 hover:bg-fog/60 transition-colors border-l-[3px] ${edgeOf(r.tier)}`}>
                                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/engagements/${r.e.id}`)}>
                                            <div className="text-sm text-ink truncate">{r.it.p}</div>
                                            <div className={`text-xs truncate mt-0.5 ${r.it.due && r.it.due < td ? 'text-deep font-medium' : 'text-slate-400'}`}>
                                              {r.it.sub}{r.it.due ? ` · due ${r.it.due}` : ''}{r.inherited ? ' · via in-charge' : ''}
                                            </div>
                                          </div>
                                          {r.tier && (
                                            <span className={`text-[10px] tabular-nums shrink-0 ${TIER_STYLE[r.tier].text}`} title="Days since last progress">
                                              {ageLabel(r.age)}
                                            </span>
                                          )}
                                          {!isStudent && <OwnerSelect value={r.it.owner} team={team} onChange={(v) => patch(r, { owner: v })} />}
                                          <StatusSelect it={r.it} onChange={(v) => patch(r, withStatus(r.it, v))} />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {done.length > 0 && (
            <div className="mt-6">
              <button onClick={() => setShowDone(!showDone)} className="text-xs text-slate-400 hover:text-ink transition-colors flex items-center gap-1.5">
                <svg className={`w-3.5 h-3.5 transition-transform ${showDone ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {showDone ? 'Hide' : 'Show'} completed ad-hoc tasks from last 30 days ({done.length})
              </button>
              {showDone && (
                <div className="mt-2 bg-paper border border-tint rounded-xl divide-y divide-tint/60">
                  {done.slice(0, 50).map(({ e, it }) => (
                    <div key={it.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-400 truncate line-through">{it.p}</div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">{it.owner || e.incharge || 'unassigned'} · completed {it.statusSince}</div>
                      </div>
                      <button onClick={() => patch({ it, e }, withStatus(it, 'No progress'))} className="text-xs px-2.5 py-1 rounded-lg text-ink hover:bg-fog border border-tint shrink-0 transition-colors">
                        Reopen
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <Modal title="Add task" onClose={() => { setShowAddModal(false); setAdd({ title: '', type: '', owner: '', clientId: '', engagementId: '', due: '' }); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Description / title <span className="text-deep">*</span></label>
              <input
                autoFocus
                value={add.title}
                onChange={(e) => setAdd({ ...add, title: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && add.title.trim()) submitAdd(); }}
                placeholder="e.g. chase the signed rep letter"
                className="w-full border border-tint rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:border-green transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
              <select
                value={add.type}
                onChange={(e) => setAdd({ ...add, type: e.target.value })}
                className="w-full border border-tint rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:border-green transition-colors text-ink"
              >
                <option value="">Select type…</option>
                {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {!isStudent && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Assign to</label>
                <select
                  value={add.owner}
                  onChange={(e) => setAdd({ ...add, owner: e.target.value })}
                  className="w-full border border-tint rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:border-green transition-colors text-ink"
                >
                  <option value="">Unassigned</option>
                  {team.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Firm <span className="text-slate-400">(optional)</span></label>
              <select
                value={add.clientId}
                onChange={(e) => setAdd({ ...add, clientId: e.target.value, engagementId: '' })}
                className="w-full border border-tint rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:border-green transition-colors text-ink"
              >
                <option value="">No firm</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {add.clientId && clientEngagements.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Engagement year <span className="text-slate-400">(optional)</span></label>
                <select
                  value={add.engagementId}
                  onChange={(e) => setAdd({ ...add, engagementId: e.target.value })}
                  className="w-full border border-tint rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:border-green transition-colors text-ink"
                >
                  <option value="">Any / most recent</option>
                  {clientEngagements.map((e) => <option key={e.id} value={e.id}>FY {e.year}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Deadline <span className="text-slate-400">(optional)</span></label>
              <input
                type="date"
                value={add.due}
                onChange={(e) => setAdd({ ...add, due: e.target.value })}
                className="w-full border border-tint rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:border-green transition-colors text-ink"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-tint">
              <button
                onClick={() => { setShowAddModal(false); setAdd({ title: '', type: '', owner: '', clientId: '', engagementId: '', due: '' }); }}
                className="text-sm px-4 py-2 rounded-lg text-ink hover:bg-fog border border-tint transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitAdd}
                disabled={!add.title.trim() || addLoading}
                className="text-sm px-4 py-2 rounded-lg font-medium bg-deep text-paper hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {addLoading ? 'Adding…' : 'Add task'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
