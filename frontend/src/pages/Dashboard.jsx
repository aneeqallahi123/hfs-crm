import React, { useState, useEffect, useRef } from 'react';
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
  'Open tasks': 'Total number of tasks across all clients that are currently in progress or not yet started — anything that hasn\'t been completed or marked N/A.',
  'Awaited from clients': 'Documents or information that have been requested from clients and are still outstanding — the ball is in the client\'s court.',
  'To review': 'Items submitted by clients or staff that are sitting in your queue waiting to be reviewed and signed off.',
  'Flagged': 'Tasks that have been escalated or flagged as needing immediate attention due to age, risk, or stalling.',
  'Files to match': 'Files received in the inbox that haven\'t yet been matched to a specific checklist item or engagement task.',
};

function InfoIcon({ label }) {
  const [show, setShow] = useState(false);
  const desc = KPI_DESCRIPTIONS[label] || '';
  if (!desc) return null;
  return (
    <span className="relative inline-flex ml-1.5 align-middle">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="w-4 h-4 rounded-full border border-slate-300 text-slate-400 text-[10px] flex items-center justify-center hover:border-green hover:text-green transition-colors focus:outline-none"
        tabIndex={-1}
        aria-label={`Info: ${label}`}
      >
        i
      </button>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 text-xs bg-ink text-paper rounded-lg px-3 py-2 shadow-xl z-50 pointer-events-none leading-relaxed" role="tooltip">
          {desc}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink" />
        </span>
      )}
    </span>
  );
}

function Stat({ label, value, onClick, active }) {
  const shown = useCountUp(value);
  const inner = (
    <>
      <div className={`text-[40px] leading-[1.1] font-medium tabular-nums tracking-[-0.02em] ${value ? 'text-green' : 'text-slate-400'}`}>{shown}</div>
      <div className="text-sm text-slate-600 mt-2 flex items-center gap-0.5">
        {label}
        <InfoIcon label={label} />
      </div>
    </>
  );
  if (!onClick) return <div className="px-6 py-6">{inner}</div>;
  return (
    <button onClick={onClick} aria-pressed={!!active} title="Show only these below" className={`text-left px-6 py-6 transition-colors ${active ? 'bg-paper' : 'hover:bg-paper/60'}`}>
      {inner}
    </button>
  );
}

function edgeCls(tier) {
  return tier ? ({ watch: 'border-tint', flag: 'border-green', urgent: 'border-deep' })[tier] : 'border-transparent';
}

function dueLabel(daysLeft, pct) {
  if (pct === 100) return '—';
  if (daysLeft == null) return null;
  if (daysLeft < 0) return `${-daysLeft}d overdue`;
  if (daysLeft === 0) return 'Due today';
  return `In ${daysLeft}d`;
}

function ClientsTable({ rows, navigate }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [sortKey, setSortKey] = useState('health'); // health | name | awaited | due

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
  const filtered = q ? grouped.filter((g) => (g.client?.name || '').toLowerCase().includes(q)) : grouped;

  function toggle(cid) {
    setExpanded((prev) => ({ ...prev, [cid]: !prev[cid] }));
  }

  // Aggregate metrics per client group
  function agg(cRows) {
    const totalAwaited = cRows.reduce((s, r) => s + (r.m.outstandingCount || 0), 0);
    const totalReview = cRows.reduce((s, r) => s + (r.m.review || 0), 0);
    // Nearest upcoming deadline (min daysLeft that isn't null, not overdue pct=100)
    const dues = cRows.map((r) => r.m.daysLeft).filter((d) => d != null);
    const nearestDue = dues.length ? Math.min(...dues) : null;
    // Worst health
    const rank = (m) => (m.pct === 100 ? -1 : m.worst ? RANK[m.worst] : 0);
    const worstRow = cRows.slice().sort((a, b) => rank(b.m) - rank(a.m))[0];
    return { totalAwaited, totalReview, nearestDue, worstRow };
  }

  const rank = (m) => (m.pct === 100 ? -1 : m.worst ? RANK[m.worst] : 0);
  const sortedGrouped = filtered.slice().sort((a, b) => {
    if (sortKey === 'name') return (a.client?.name || '').localeCompare(b.client?.name || '');
    if (sortKey === 'awaited') return b.rows.reduce((s, r) => s + (r.m.outstandingCount || 0), 0) - a.rows.reduce((s, r) => s + (r.m.outstandingCount || 0), 0);
    if (sortKey === 'due') {
      const da = Math.min(...a.rows.map((r) => r.m.daysLeft ?? 9999));
      const db = Math.min(...b.rows.map((r) => r.m.daysLeft ?? 9999));
      return da - db;
    }
    // default: health (worst first)
    const bestA = Math.max(...a.rows.map((r) => rank(r.m)));
    const bestB = Math.max(...b.rows.map((r) => rank(r.m)));
    return bestB - bestA;
  });

  function SortBtn({ col, label }) {
    return (
      <button onClick={() => setSortKey(col)} className={`flex items-center gap-1 transition-colors ${sortKey === col ? 'text-green' : 'hover:text-ink'}`}>
        {label}
        {sortKey === col && <span className="text-[9px]">▼</span>}
      </button>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="w-full text-sm pl-8 pr-3 py-1.5 rounded-lg border border-tint bg-paper focus:outline-none focus:border-green placeholder:text-slate-400 transition-colors"
          />
        </div>
        {search && (
          <button onClick={() => setSearch('')} className="text-xs text-slate-400 hover:text-ink transition-colors">Clear</button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{sortedGrouped.length} client{sortedGrouped.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="bg-paper border border-tint rounded-xl overflow-hidden" style={{ maxHeight: 'calc(100vh - 280px)', minHeight: 300, overflowY: 'auto' }}>
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-fog/98 backdrop-blur-sm">
            <tr className="text-left font-mono text-[11px] text-slate-500 border-b border-tint">
              <th className="px-4 py-2.5 font-medium">
                <SortBtn col="name" label="Client" />
              </th>
              <th className="px-4 py-2.5 font-medium text-right">
                <SortBtn col="awaited" label="Awaited" />
              </th>
              <th className="px-4 py-2.5 font-medium text-right">To review</th>
              <th className="px-4 py-2.5 font-medium text-right">
                <SortBtn col="due" label="Due" />
              </th>
              <th className="px-4 py-2.5 font-medium">
                <SortBtn col="health" label="Health" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedGrouped.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-sm text-slate-400 text-center">
                  {search ? `No clients matching "${search}"` : 'No clients found.'}
                </td>
              </tr>
            )}
            {sortedGrouped.map(({ client, clientId, rows: cRows }) => {
              const isOpen = expanded[clientId];
              const { totalAwaited, totalReview, nearestDue, worstRow } = agg(cRows);
              const h = healthOf(worstRow.m);
              const hasMultiple = cRows.length > 1;
              // Sort years: latest first
              const sortedYears = cRows.slice().sort((a, b) => (b.e.year > a.e.year ? 1 : -1));
              const nearestPct = nearestDue != null && cRows.some((r) => r.m.daysLeft === nearestDue && r.m.pct < 100) ? (cRows.find((r) => r.m.daysLeft === nearestDue)?.m.pct ?? 100) : 100;
              const dueTxt = dueLabel(nearestDue, nearestPct);
              const dueUrgent = nearestDue != null && nearestDue < 0 && nearestPct < 100;
              const dueSoon = nearestDue != null && nearestDue >= 0 && nearestDue <= 7 && nearestPct < 100;

              return (
                <React.Fragment key={clientId}>
                  <tr
                    onClick={() => hasMultiple ? toggle(clientId) : navigate(`/engagements/${sortedYears[0].e.id}`)}
                    className={`border-b border-tint last:border-0 cursor-pointer transition-all duration-150 ${isOpen ? 'bg-fog/40' : 'hover:bg-fog/60'}`}
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      <span className="flex items-center gap-2">
                        {hasMultiple && (
                          <span className={`text-slate-400 text-[10px] transition-transform duration-200 inline-block ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                        )}
                        {!hasMultiple && <span className="w-3.5" />}
                        <span>{client?.name}</span>
                        {cRows[0].e.incharge && <span className="text-xs text-slate-400 font-normal">{cRows[0].e.incharge}</span>}
                        {hasMultiple && (
                          <span className="text-[10px] text-slate-400 font-normal tabular-nums">{cRows.length} yrs</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {totalAwaited ? <span className="text-ink font-medium">{totalAwaited}</span> : <span className="text-slate-300">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {totalReview ? <span className="text-ink font-medium">{totalReview}</span> : <span className="text-slate-300">0</span>}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums text-xs ${dueUrgent ? 'text-deep font-semibold' : dueSoon ? 'text-green font-medium' : 'text-slate-500'}`}>
                      {dueTxt || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${h.cls}`}>{h.label}</span>
                    </td>
                  </tr>

                  {/* Year rows — animate open/close */}
                  {hasMultiple && sortedYears.map(({ e, m }, idx) => {
                    const yh = healthOf(m);
                    const yDue = dueLabel(m.daysLeft, m.pct);
                    const yDueUrgent = m.daysLeft != null && m.daysLeft < 0 && m.pct < 100;
                    const yDueSoon = m.daysLeft != null && m.daysLeft >= 0 && m.daysLeft <= 7 && m.pct < 100;
                    return (
                      <tr
                        key={e.id}
                        onClick={() => navigate(`/engagements/${e.id}`)}
                        className={`border-b border-tint/60 last:border-0 cursor-pointer transition-all duration-150 bg-fog/20 hover:bg-fog/50 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none h-0'}`}
                        style={{
                          display: isOpen ? undefined : 'none',
                        }}
                      >
                        <td className="px-4 py-2.5 text-slate-500 pl-10">
                          <span className="flex items-center gap-2">
                            <span className="text-slate-300 text-xs">└</span>
                            <span className="text-xs font-medium">FY {e.year}</span>
                            {idx === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green/10 text-green border border-green/20 font-medium">latest</span>}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                          {m.outstandingCount ? <span className="text-slate-600">{m.outstandingCount}</span> : <span className="text-slate-300">0</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                          {m.review ? <span className="text-slate-600">{m.review}</span> : <span className="text-slate-300">0</span>}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums text-xs ${yDueUrgent ? 'text-deep font-semibold' : yDueSoon ? 'text-green' : 'text-slate-400'}`}>
                          {yDue || <span className="text-slate-300">—</span>}
                        </td>
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
  const td = today();

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
      eg.forEach((e, i) => { im[e.id] = Array.isArray(itemLists[i]) ? itemLists[i] : []; bm[e.id] = Array.isArray(inboxLists[i]) ? inboxLists[i] : []; });
      setItemsByEng(im);
      setInboxByEng(bm);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="stagger p-8 max-w-5xl"><div className="text-sm text-slate-400">Loading…</div></div>;

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
  const overallPct = rows.length ? Math.round(rows.reduce((s, r) => s + r.m.pct, 0) / rows.length) : 0;

  return (
    <div className="stagger p-8 max-w-5xl">
      <header className="mb-6 flex items-end gap-6">
        <div className="flex items-center gap-5">
          {rows.length > 0 && <ProgressRing pct={overallPct} />}
          <div>
            <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Overview</h1>
            <div className="mt-3 h-px w-12 bg-green" />
          </div>
        </div>
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
          <div className="grid grid-cols-2 md:grid-cols-5 bg-fog rounded-lg divide-x divide-tint overflow-hidden mb-10">
            <Stat label="Open tasks" value={openTasksCount} />
            <Stat label="Awaited from clients" value={totalOutstanding} />
            <Stat label="To review" value={toReview} />
            <Stat label="Flagged" value={flaggedCount} />
            <Stat label="Files to match" value={filesToMatch} />
          </div>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink mb-3">Clients</h2>
            <ClientsTable rows={rows} navigate={navigate} />
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
  const td = today();
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const myRows = [];
  let totalMine = 0, doneMine = 0;
  const myEngs = [];
  for (const { e, client, items, m } of rows) {
    let mineHere = false;
    let mineOpen = 0;
    for (const it of items) {
      if (!it.headIncluded || it.status === 'NA') continue;
      const owner = it.owner || e.incharge || '';
      if (owner !== user?.name) continue;
      mineHere = true;
      totalMine++;
      if (it.status === 'Completed') { doneMine++; continue; }
      mineOpen++;
      myRows.push({ e, client, it, tier: progressTier(it), age: noProgressDays(it), stage: stageOf(it) });
    }
    if (mineHere || e.incharge === user?.name) myEngs.push({ e, client, m, mine: mineOpen });
  }
  myRows.sort((a, b) => { const ra = a.tier ? RANK[a.tier] : 0, rb = b.tier ? RANK[b.tier] : 0; if (ra !== rb) return rb - ra; return (b.age || 0) - (a.age || 0); });
  myEngs.sort((a, b) => b.mine - a.mine);
  const myPct = totalMine ? Math.round((doneMine / totalMine) * 100) : 0;
  const stageCount = {};
  myRows.forEach((r) => { stageCount[r.stage] = (stageCount[r.stage] || 0) + 1; });
  const flaggedCount = myRows.filter((r) => !!r.tier).length;

  const FILTERS = [
    ['all', 'Everything', myRows.length],
    ['request', 'To request', stageCount.request || 0],
    ['awaited', 'Awaited', stageCount.awaited || 0],
    ['review', 'To review', stageCount.review || 0],
    ['internal', 'Not started', stageCount.internal || 0],
    ['adhoc', 'Ad-hoc', stageCount.adhoc || 0],
  ];
  const filtered = filter === 'all' ? myRows : myRows.filter((r) => r.stage === filter);

  async function complete(itemId) {
    try { await api.items.update(itemId, { status: 'Completed', statusSince: today() }); toast('Marked complete', 'success'); reload(); }
    catch (err) { toast(err.message, 'error'); }
  }

  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; })();
  const firstName = (user?.name || '').split(' ')[0];

  return (
    <div className="stagger p-8 max-w-5xl">
      <header className="mb-6 flex items-end gap-6">
        <div className="flex items-center gap-5">
          {totalMine > 0 && <ProgressRing pct={myPct} />}
          <div>
            <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">{greeting}, {firstName || 'there'}</h1>
            <div className="mt-3 h-px w-12 bg-green" />
          </div>
        </div>
      </header>

      {totalMine === 0 && myEngs.length === 0 ? (
        <div className="bg-paper border border-tint rounded-2xl p-10 text-center">
          <h2 className="font-serif text-xl font-semibold text-deep mb-2">Nothing assigned to you yet</h2>
          <p className="text-sm text-slate-500">Once a manager or partner puts a client's task in your name — or makes you the in-charge — it will show up right here.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 bg-fog rounded-lg divide-x divide-tint overflow-hidden mb-8">
            <Stat label="To request" value={stageCount.request || 0} active={filter === 'request'} onClick={() => setFilter(filter === 'request' ? 'all' : 'request')} />
            <Stat label="Awaited" value={stageCount.awaited || 0} active={filter === 'awaited'} onClick={() => setFilter(filter === 'awaited' ? 'all' : 'awaited')} />
            <Stat label="To review" value={stageCount.review || 0} active={filter === 'review'} onClick={() => setFilter(filter === 'review' ? 'all' : 'review')} />
            <Stat label="Flagged" value={flaggedCount} />
          </div>

          {myEngs.length > 0 && (
            <section className="mb-8">
              <h2 className="font-serif text-xl font-medium text-ink mb-3">My clients</h2>
              <div className="bg-paper border border-tint rounded-xl divide-y divide-tint/60">
                {myEngs.map(({ e, client, m, mine }) => {
                  const h = healthOf(m);
                  return (
                    <div key={e.id} onClick={() => navigate(`/engagements/${e.id}`)} className="px-4 py-3 flex items-center gap-3 hover:bg-fog cursor-pointer transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink truncate">
                          {client?.name} <span className="ml-2 text-xs text-slate-400 font-normal">FY {e.year}</span>
                          {e.incharge === user?.name && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full border text-green border-green">in-charge</span>}
                        </div>
                        <div className="text-xs text-slate-400">{mine} open task{mine === 1 ? '' : 's'} for you · {m.pct}% complete overall</div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${h.cls}`}>{h.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-serif text-xl font-medium text-ink">My tasks</h2>
              <div className="flex gap-1 flex-wrap">
                {FILTERS.map(([k, l, n]) => (
                  <button key={k} onClick={() => setFilter(k)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filter === k ? 'bg-deep text-paper border-deep' : 'text-ink border-tint hover:bg-fog'}`}>
                    {l} <span className={filter === k ? 'text-tint' : 'text-slate-400'}>{n}</span>
                  </button>
                ))}
              </div>
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 px-1">Nothing here — you're caught up.</p>
            ) : (
              <div className="bg-paper border border-tint rounded-xl divide-y divide-tint/60">
                {filtered.slice(0, 100).map((r) => (
                  <div key={r.it.id} className={`pl-3 pr-4 py-2.5 flex items-center gap-3 hover:bg-fog border-l-4 ${edgeCls(r.tier)}`}>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/engagements/${r.e.id}`)}>
                      <div className="text-sm text-ink truncate">{isAdhoc(r.it) ? 'Ad-hoc · ' : ''}{r.it.p}</div>
                      <div className="text-xs text-slate-400 truncate">{r.client?.name || 'Firm'} · FY{r.e.year} · {r.it.sub}{r.it.due ? ` · due ${r.it.due}` : ''}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${statusStyle(r.it)}`}>{statusLabel(r.it)}</span>
                    <span className="text-xs text-slate-400 tabular-nums w-14 text-right shrink-0">{r.age != null ? ageLabel(r.age) : '—'}</span>
                    {(r.stage === 'review' || isAdhoc(r.it)) && (
                      <button onClick={() => complete(r.it.id)} className="text-xs px-2 py-1 rounded-md text-green hover:bg-fog border border-tint shrink-0">Complete</button>
                    )}
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
