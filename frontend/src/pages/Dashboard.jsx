import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import ProgressRing from '../components/ProgressRing.jsx';
import { useCountUp } from '../components/ProgressRing.jsx';
import {
  today, engMetrics, healthOf, progressTier, deadlineTier, isAdhoc, isAwaited,
  noProgressDays, ageLabel, statusLabel, statusStyle, withStatus, RANK,
} from '../lib/metrics.js';

const KPI_DESCRIPTIONS = {
  'Open tasks': 'Tasks across all clients that are in progress or not yet started — anything that hasn\'t been completed or marked N/A.',
  'Awaited from clients': 'Documents requested from clients that are still outstanding. The ball is in the client\'s court.',
  'To review': 'Items submitted by clients or staff waiting to be reviewed and signed off.',
  'Flagged': 'Tasks escalated as needing immediate attention due to age, risk, or being stalled.',
  'Files to match': 'Files received in the inbox that haven\'t been matched to a checklist item yet.',
  'Completed': 'Total tasks completed',
};

// Tooltip — absolute, centred above the button.
// Works because the KPI grid has no overflow:hidden, so nothing clips it.
function InfoIcon({ label }) {
  const [show, setShow] = useState(false);
  const desc = KPI_DESCRIPTIONS[label] || '';
  if (!desc) return null;
  return (
    <span className="relative inline-flex items-center ml-1.5">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="w-3.5 h-3.5 rounded-full border border-slate-300 text-slate-400 text-[9px] flex items-center justify-center hover:border-green hover:text-green transition-colors focus:outline-none shrink-0"
        tabIndex={-1}
        aria-label={`About: ${label}`}
      >
        i
      </button>
      {show && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 z-50 pointer-events-none"
        >
          <span className="block text-xs bg-ink text-paper rounded-xl px-3.5 py-2.5 shadow-2xl leading-relaxed whitespace-normal">
            {desc}
            <span className="block absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-ink" />
          </span>
        </span>
      )}
    </span>
  );
}

function Stat({ label, value, onClick, active }) {
  const shown = useCountUp(value);
  const inner = (
    <div className="px-5 py-5">
      <div className={`text-[30px] leading-none font-medium font-mono tabular-nums tracking-[-0.02em] ${value ? 'text-ink' : 'text-slate-300'}`}>
        {shown}
      </div>
      <div className="text-[11px] text-slate-400 mt-2.5 flex items-start gap-1 leading-tight font-medium">
        <span>{label}</span>
        <InfoIcon label={label} />
      </div>
    </div>
  );
  if (!onClick) return inner;
  return (
    <button
      onClick={onClick}
      aria-pressed={!!active}
      className={`w-full text-left transition-colors duration-150 ${active ? 'bg-white' : 'hover:bg-white/50'}`}
    >
      {inner}
    </button>
  );
}

function edgeCls(tier) {
  return tier ? ({ watch: 'border-tint', flag: 'border-green', urgent: 'border-deep' })[tier] : 'border-transparent';
}

function dueLabel(daysLeft, pct) {
  if (pct === 100) return '—';
  if (daysLeft == null) return '—';
  if (daysLeft < 0) return `${-daysLeft}d overdue`;
  if (daysLeft === 0) return 'Due today';
  return `In ${daysLeft}d`;
}

function dueCls(daysLeft, pct) {
  if (pct === 100 || daysLeft == null) return 'text-slate-400';
  if (daysLeft < 0) return 'text-deep font-semibold';
  if (daysLeft <= 7) return 'text-green font-medium';
  return 'text-slate-500';
}

function ClientsTable({ rows, navigate, clientCount }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [sortKey, setSortKey] = useState('health');

  const grouped = [];
  const seen = {};
  for (const row of rows) {
    const cid = row.e.clientId;
    if (!seen[cid]) {
      seen[cid] = true;
      const clientRows = rows.filter((r) => r.e.clientId === cid);
      grouped.push({ client: row.client, clientId: cid, rows: clientRows });
    }
  }

  const q = search.trim().toLowerCase();
  const visible = q ? grouped.filter((g) => (g.client?.name || '').toLowerCase().includes(q)) : grouped;

  function toggle(cid) {
    setExpanded((prev) => ({ ...prev, [cid]: !prev[cid] }));
  }

  function agg(cRows) {
    const totalAwaited = cRows.reduce((s, r) => s + (r.m.outstandingCount || 0), 0);
    const totalReview = cRows.reduce((s, r) => s + (r.m.review || 0), 0);
    const dues = cRows.map((r) => r.m.daysLeft).filter((d) => d != null);
    const nearestDue = dues.length ? Math.min(...dues) : null;
    const rankM = (m) => (m.pct === 100 ? -1 : m.worst ? RANK[m.worst] : 0);
    const worstRow = cRows.slice().sort((a, b) => rankM(b.m) - rankM(a.m))[0];
    const nearestPct = nearestDue != null ? (cRows.find((r) => r.m.daysLeft === nearestDue)?.m.pct ?? 100) : 100;
    return { totalAwaited, totalReview, nearestDue, nearestPct, worstRow };
  }

  const rankM = (m) => (m.pct === 100 ? -1 : m.worst ? RANK[m.worst] : 0);
  const sorted = visible.slice().sort((a, b) => {
    if (sortKey === 'name') return (a.client?.name || '').localeCompare(b.client?.name || '');
    if (sortKey === 'awaited') {
      return b.rows.reduce((s, r) => s + (r.m.outstandingCount || 0), 0)
           - a.rows.reduce((s, r) => s + (r.m.outstandingCount || 0), 0);
    }
    if (sortKey === 'due') {
      const da = Math.min(...a.rows.map((r) => r.m.daysLeft ?? 9999));
      const db = Math.min(...b.rows.map((r) => r.m.daysLeft ?? 9999));
      return da - db;
    }
    return Math.max(...b.rows.map((r) => rankM(r.m))) - Math.max(...a.rows.map((r) => rankM(r.m)));
  });

  // Right-aligned sortable header
  function RColHeader({ col, label }) {
    const active = sortKey === col;
    return (
      <th className="py-3 px-4 text-right text-[11px] font-medium">
        <button
          onClick={() => setSortKey(col)}
          className={`inline-flex items-center gap-1 ml-auto transition-colors ${active ? 'text-green' : 'text-slate-400 hover:text-slate-600'}`}
        >
          {label}
          <span className={`text-[8px] ${active ? 'opacity-100' : 'opacity-0'}`}>▼</span>
        </button>
      </th>
    );
  }

  // Left-aligned sortable header
  function LColHeader({ col, label }) {
    const active = sortKey === col;
    return (
      <th className="py-3 px-4 text-left text-[11px] font-medium">
        <button
          onClick={() => setSortKey(col)}
          className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-green' : 'text-slate-400 hover:text-slate-600'}`}
        >
          {label}
          <span className={`text-[8px] ${active ? 'opacity-100' : 'opacity-0'}`}>▼</span>
        </button>
      </th>
    );
  }

  return (
    <div>
      {/* Search bar */}
      <div className="mb-3 flex items-center gap-2.5">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" strokeWidth="2"/><path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="text-sm pl-9 pr-8 py-2 rounded-lg border border-tint bg-paper focus:outline-none focus:border-green placeholder:text-slate-400 transition-colors w-64"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-ink transition-colors text-xs"
            >✕</button>
          )}
        </div>
        {/* Glass count chip */}
        <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-tint/70 bg-fog/60 backdrop-blur-sm text-xs font-mono text-slate-500 select-none">
          {search ? `${sorted.length} / ${clientCount}` : clientCount}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-tint bg-paper" style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
        <table className="w-full text-sm" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <colgroup>
            {/* Client name */}
            <col style={{ width: '38%' }} />
            {/* Awaited */}
            <col style={{ width: '14%' }} />
            {/* Review */}
            <col style={{ width: '14%' }} />
            {/* Due */}
            <col style={{ width: '18%' }} />
            {/* Health */}
            <col style={{ width: '16%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-fog border-b border-tint">
            <tr>
              <LColHeader col="name" label="Client" />
              <RColHeader col="awaited" label="Awaited" />
              <th className="py-3 px-4 text-right text-[11px] font-medium text-slate-400">Review</th>
              <RColHeader col="due" label="Due" />
              <LColHeader col="health" label="Health" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-sm text-slate-400 text-center">
                  {search ? `No clients matching "${search}"` : 'No clients yet.'}
                </td>
              </tr>
            )}
            {sorted.map(({ client, clientId, rows: cRows }) => {
              const isOpen = expanded[clientId];
              const sortedYears = cRows.slice().sort((a, b) => (b.e.year > a.e.year ? 1 : -1));
              const incharge = cRows[0].e.incharge;

              return (
                <React.Fragment key={clientId}>
                  {/* Client header row — name only, no data values */}
                  <tr
                    onClick={() => toggle(clientId)}
                    className={`border-b border-tint cursor-pointer select-none transition-colors duration-100 ${isOpen ? 'bg-fog' : 'hover:bg-fog/50'}`}
                  >
                    <td className="px-4 py-3" colSpan={5}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`shrink-0 w-4 h-4 rounded border border-tint flex items-center justify-center text-[8px] text-slate-400 transition-all duration-200 ${isOpen ? 'rotate-90 bg-tint' : 'bg-fog'}`}>
                          ▶
                        </span>
                        <span className="font-medium text-ink truncate">{client?.name}</span>
                        {incharge && (
                          <span className="text-xs text-slate-400 font-normal shrink-0">{incharge}</span>
                        )}
                        <span className="text-[10px] text-slate-300 font-normal shrink-0">
                          {cRows.length} {cRows.length === 1 ? 'yr' : 'yrs'}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Year rows — always rendered when expanded */}
                  {isOpen && sortedYears.map(({ e, m }, idx) => {
                    const yh = healthOf(m);
                    return (
                      <tr
                        key={e.id}
                        onClick={() => navigate(`/engagements/${e.id}`)}
                        className="border-b border-tint/50 last:border-b-0 cursor-pointer bg-paper hover:bg-fog/40 transition-colors duration-100"
                        style={{ animation: 'slideDown .18s cubic-bezier(.2,.7,.2,1) both' }}
                      >
                        {/* Year label */}
                        <td className="px-4 py-2.5 pl-9">
                          <div className="flex items-center gap-2">
                            <span className="text-tint text-xs shrink-0">└</span>
                            <span className="text-sm text-slate-700 font-medium font-mono">FY {e.year}</span>
                            {idx === 0 && (
                              <span className="text-[9px] px-1.5 py-px rounded bg-tint text-green font-semibold tracking-[0.06em] uppercase">latest</span>
                            )}
                          </div>
                        </td>
                        {/* Awaited */}
                        <td className="px-4 py-2.5 text-right tabular-nums text-sm font-mono">
                          {m.outstandingCount
                            ? <span className="text-ink font-medium">{m.outstandingCount}</span>
                            : <span className="text-tint">—</span>}
                        </td>
                        {/* Review */}
                        <td className="px-4 py-2.5 text-right tabular-nums text-sm font-mono">
                          {m.review
                            ? <span className="text-ink font-medium">{m.review}</span>
                            : <span className="text-tint">—</span>}
                        </td>
                        {/* Due */}
                        <td className={`px-4 py-2.5 text-right tabular-nums text-xs font-mono ${dueCls(m.daysLeft, m.pct)}`}>
                          {dueLabel(m.daysLeft, m.pct)}
                        </td>
                        {/* Health */}
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${yh.cls}`}>{yh.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [itemsByEng, setItemsByEng] = useState({});
  const [inboxByEng, setInboxByEng] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    try {
      const [c, e] = await Promise.all([api.clients.list(), api.engagements.list()]);
      const cl = Array.isArray(c) ? c : [];
      const eg = Array.isArray(e) ? e : [];
      setClients(cl);
      setEngagements(eg);
      const [itemLists, inboxLists] = await Promise.all([
        Promise.all(eg.map((e) => api.items.list(e.id).catch(() => []))),
        Promise.all(eg.map((e) => api.inbox.list(e.id).catch(() => []))),
      ]);
      const im = {}, bm = {};
      eg.forEach((e, i) => {
        im[e.id] = Array.isArray(itemLists[i]) ? itemLists[i] : [];
        bm[e.id] = Array.isArray(inboxLists[i]) ? inboxLists[i] : [];
      });
      setItemsByEng(im);
      setInboxByEng(bm);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="p-8 max-w-5xl">
        <div className="text-sm text-slate-400">Loading…</div>
      </div>
    );
  }

  const rows = engagements.map((e) => {
    const client = clients.find((c) => c.id === e.clientId);
    const items = itemsByEng[e.id] || [];
    const m = engMetrics({ ...e, items }, inboxByEng[e.id] || []);
    return { e, client, items, m };
  });

  if (user?.role === 'student') return <StudentDashboardBody rows={rows} toast={toast} reload={load} />;

  const totalOutstanding = rows.reduce((s, r) => s + r.m.outstandingCount, 0);
  const toReview = rows.reduce((s, r) => s + r.m.review, 0);
  const filesToMatch = rows.reduce((s, r) => s + (inboxByEng[r.e.id] || []).filter((f) => !f.assignedItemId && f.status !== 'Irrelevant').length, 0);
  const flaggedCount = rows.reduce((s, r) => s + r.items.filter((it) => it.headIncluded && progressTier(it)).length, 0);
  const openTasksCount = rows.reduce((s, r) => s + r.items.filter((it) => it.headIncluded && it.status === 'No progress').length, 0);
  const completedCount = rows.reduce((s, r) => s + r.items.filter((it) => it.headIncluded && it.status === 'Completed').length, 0);
  const overallPct = rows.length ? Math.round(rows.reduce((s, r) => s + r.m.pct, 0) / rows.length) : 0;
  const clientCount = new Set(rows.map((r) => r.e.clientId)).size;

  return (
    <div className="stagger p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="font-serif text-[30px] leading-none font-medium text-ink tracking-[-0.01em]">Overview</h1>
        <div className="mt-3 h-0.5 w-10 bg-green rounded-sm" />
      </header>

      {rows.length === 0 ? (
        <div className="bg-paper border border-tint rounded-2xl p-10">
          <h2 className="font-serif text-xl font-semibold text-deep mb-2">Welcome. Three steps to get going.</h2>
          <ol className="space-y-3 mt-5 text-sm text-slate-600">
            <li className="flex gap-3"><span className="w-6 h-6 rounded-full border border-tint text-ink text-xs flex items-center justify-center shrink-0">1</span><span><span className="font-medium text-ink">Add your team</span> under Team.</span></li>
            <li className="flex gap-3"><span className="w-6 h-6 rounded-full border border-tint text-ink text-xs flex items-center justify-center shrink-0">2</span><span><span className="font-medium text-ink">Add a client</span> under Clients, then start a year.</span></li>
            <li className="flex gap-3"><span className="w-6 h-6 rounded-full border border-tint text-ink text-xs flex items-center justify-center shrink-0">3</span><span><span className="font-medium text-ink">Scope</span> which areas apply, set a deadline and an in-charge, and message the client.</span></li>
          </ol>
        </div>
      ) : (
        <>
          {/* KPI cards — no overflow:hidden so tooltips aren't clipped */}
          <div className="grid grid-cols-2 md:grid-cols-6 bg-fog rounded-xl border border-tint divide-x divide-tint mb-10">
            <Stat label="Open tasks" value={openTasksCount} />
            <Stat label="Awaited from clients" value={totalOutstanding} />
            <Stat label="To review" value={toReview} />
            <Stat label="Flagged" value={flaggedCount} />
            <Stat label="Files to match" value={filesToMatch} />
            <Stat label="Completed" value={completedCount} />
          </div>

          <section>
            <h2 className="font-serif text-lg font-medium text-ink mb-3">Clients</h2>
            <ClientsTable rows={rows} navigate={navigate} clientCount={clientCount} />
          </section>
        </>
      )}
    </div>
  );
}

function daysBetweenSafe(a, b) {
  if (!a) return null;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// ---- Student view ----
function StudentDashboardBody({ rows, toast, reload }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState('all');
  const [expandedClients, setExpandedClients] = useState({});
  const navigate = useNavigate();

  const myRows = [];
  let doneMine = 0;
  const myEngsByClient = {};
  for (const { e, client, items, m } of rows) {
    let mineOpen = 0;
    for (const it of items) {
      if (!it.headIncluded || it.status === 'NA') continue;
      const owner = it.owner || e.incharge || '';
      if (owner !== user?.name) continue;
      if (it.status === 'Completed') { doneMine++; continue; }
      mineOpen++;
      myRows.push({ e, client, it, tier: progressTier(it), age: noProgressDays(it), stage: stageOf(it) });
    }
    const cid = e.clientId;
    if (!myEngsByClient[cid]) myEngsByClient[cid] = { client, engs: [] };
    myEngsByClient[cid].engs.push({ e, m, mine: mineOpen });
  }

  myRows.sort((a, b) => {
    const ra = a.tier ? RANK[a.tier] : 0, rb = b.tier ? RANK[b.tier] : 0;
    if (ra !== rb) return rb - ra;
    return (b.age || 0) - (a.age || 0);
  });

  const stageCount = {};
  myRows.forEach((r) => { stageCount[r.stage] = (stageCount[r.stage] || 0) + 1; });
  const flaggedCount = myRows.filter((r) => !!r.tier).length;
  const totalOpen = myRows.length;

  const myClientGroups = Object.values(myEngsByClient).filter(
    ({ engs }) => engs.some(({ e, mine }) => mine > 0 || e.incharge === user?.name)
  );
  myClientGroups.sort((a, b) => {
    const ta = a.engs.reduce((s, x) => s + x.mine, 0);
    const tb = b.engs.reduce((s, x) => s + x.mine, 0);
    return tb - ta;
  });

  const FILTERS = [
    ['all', 'All tasks', totalOpen],
    ['internal', 'Not started', stageCount.internal || 0],
    ['request', 'To request', stageCount.request || 0],
    ['awaited', 'Awaited', stageCount.awaited || 0],
    ['adhoc', 'Ad-hoc', stageCount.adhoc || 0],
    ['completed', 'Completed', doneMine],
  ];
  const filtered = filter === 'all'
    ? myRows
    : filter === 'completed'
      ? [] // completed rows not in myRows; shown separately below
      : myRows.filter((r) => r.stage === filter);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();
  const firstName = (user?.name || '').split(' ')[0];

  function toggleClient(cid) {
    setExpandedClients((prev) => ({ ...prev, [cid]: !prev[cid] }));
  }

  const currentFilterLabel = FILTERS.find(([k]) => k === filter)?.[1] ?? 'All tasks';

  return (
    <div className="stagger p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="font-serif text-[30px] leading-none font-medium text-ink tracking-[-0.01em]">{greeting}, {firstName || 'there'}</h1>
        <div className="mt-3 h-0.5 w-10 bg-green rounded-sm" />
      </header>

      {totalOpen === 0 && myClientGroups.length === 0 ? (
        <div className="bg-paper border border-tint rounded-2xl p-10 text-center">
          <h2 className="font-serif text-xl font-semibold text-deep mb-2">Nothing assigned to you yet</h2>
          <p className="text-sm text-slate-500">Once a manager or partner assigns a task to you — or makes you the in-charge — it will show up here.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 md:grid-cols-6 bg-fog rounded-xl border border-tint divide-x divide-tint mb-8">
            <Stat label="Not started" value={stageCount.internal || 0} />
            <Stat label="To request" value={stageCount.request || 0} />
            <Stat label="Awaiting" value={stageCount.awaited || 0} />
            <Stat label="To review" value={stageCount.review || 0} />
            <Stat label="Flagged" value={flaggedCount} />
            <Stat label="Completed" value={doneMine} />
          </div>

          {myClientGroups.length > 0 && (
            <section className="mb-8">
              <h2 className="font-serif text-lg font-medium text-ink mb-3">My clients</h2>
              <div className="bg-paper border border-tint rounded-xl divide-y divide-tint">
                {myClientGroups.map(({ client, engs }) => {
                  const cid = engs[0]?.e.clientId;
                  const isOpen = expandedClients[cid];
                  const totalMineHere = engs.reduce((s, x) => s + x.mine, 0);
                  const sortedEngs = engs.slice().sort((a, b) => (b.e.year > a.e.year ? 1 : -1));
                  return (
                    <React.Fragment key={cid}>
                      <div
                        onClick={() => toggleClient(cid)}
                        className={`px-4 py-3 flex items-center gap-3 cursor-pointer select-none transition-colors ${isOpen ? 'bg-fog' : 'hover:bg-fog/50'}`}
                      >
                        <span className={`shrink-0 w-4 h-4 rounded border border-tint flex items-center justify-center text-[8px] text-slate-400 transition-all duration-200 ${isOpen ? 'rotate-90 bg-tint' : 'bg-fog'}`}>▶</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-ink truncate">{client?.name}</span>
                          <span className="ml-2 text-[10px] text-slate-300">{engs.length} {engs.length === 1 ? 'yr' : 'yrs'}</span>
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">{totalMineHere} open task{totalMineHere === 1 ? '' : 's'}</span>
                      </div>
                      {isOpen && sortedEngs.map(({ e, m, mine }, idx) => (
                        <div
                          key={e.id}
                          onClick={() => navigate(`/engagements/${e.id}`)}
                          className="pl-10 pr-4 py-2.5 flex items-center gap-3 hover:bg-fog/40 cursor-pointer transition-colors border-t border-tint/50"
                          style={{ animation: 'slideDown .18s cubic-bezier(.2,.7,.2,1) both' }}
                        >
                          <span className="text-tint text-xs shrink-0">└</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-slate-700 font-medium font-mono">FY {e.year}</span>
                            {idx === 0 && <span className="ml-2 text-[9px] px-1.5 py-px rounded bg-tint text-green font-semibold tracking-[0.06em] uppercase">latest</span>}
                            {e.incharge === user?.name && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full border text-green border-green">in-charge</span>}
                          </div>
                          <span className="text-xs text-slate-400">{mine} open · {m.pct}% complete</span>
                        </div>
                      ))}
                    </React.Fragment>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-serif text-lg font-medium text-ink">My tasks</h2>
              <div className="relative">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="text-sm pl-3 pr-8 py-1.5 rounded-lg border border-tint bg-paper text-ink focus:outline-none focus:border-green appearance-none cursor-pointer"
                >
                  {FILTERS.map(([k, l, n]) => (
                    <option key={k} value={k}>{l} ({n})</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {filter === 'completed' ? (
              <p className="text-sm text-slate-400 py-6 px-1">{doneMine} completed task{doneMine === 1 ? '' : 's'} — well done.</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 px-1">Nothing here — you're caught up.</p>
            ) : (
              <div className="bg-paper border border-tint rounded-xl divide-y divide-tint">
                {filtered.slice(0, 100).map((r) => (
                  <div key={r.it.id} className={`pl-3 pr-4 py-2.5 flex items-center gap-3 hover:bg-fog border-l-4 ${edgeCls(r.tier)} cursor-pointer`} onClick={() => navigate(`/engagements/${r.e.id}`)}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink truncate">{isAdhoc(r.it) ? 'Ad-hoc · ' : ''}{r.it.p}</div>
                      <div className="text-xs text-slate-400 truncate">{r.client?.name || 'Firm'} · FY{r.e.year} · {r.it.sub}{r.it.due ? ` · due ${r.it.due}` : ''}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${statusStyle(r.it)}`}>{statusLabel(r.it)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function stageOf(it) {
  if (isAdhoc(it)) return 'adhoc';
  if (it.status === 'Under Review') return 'review';
  if (it.requestable && (it.status === 'Requested' || it.queried)) return 'awaited';
  if (it.requestable) return 'request';
  return 'internal';
}
