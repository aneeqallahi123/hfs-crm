import React, { useState, useEffect } from 'react';
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

function Stat({ label, value, onClick, active }) {
  const shown = useCountUp(value);
  const inner = (
    <>
      <div className={`text-[40px] leading-[1.1] font-medium tabular-nums tracking-[-0.02em] ${value ? 'text-green' : 'text-slate-400'}`}>{shown}</div>
      <div className="text-sm text-slate-600 mt-2">{label}</div>
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

function PortfolioTable({ rows, navigate }) {
  const rank = (m) => (m.pct === 100 ? -1 : m.worst ? RANK[m.worst] : 0);
  const sorted = rows.slice().sort((a, b) =>
    (rank(b.m) - rank(a.m)) ||
    ((a.m.daysLeft ?? 1e9) - (b.m.daysLeft ?? 1e9)) ||
    ((b.m.oldest || 0) - (a.m.oldest || 0))
  );
  return (
    <div className="bg-paper border border-tint rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left font-mono text-[11px] text-slate-500 border-b border-tint bg-fog/60">
            <th className="px-4 py-2.5 font-medium">Client</th>
            <th className="px-4 py-2.5 font-medium">FY</th>
            <th className="px-4 py-2.5 font-medium w-40">Progress</th>
            <th className="px-4 py-2.5 font-medium text-right">Awaited</th>
            <th className="px-4 py-2.5 font-medium text-right">To review</th>
            <th className="px-4 py-2.5 font-medium text-right">Due</th>
            <th className="px-4 py-2.5 font-medium">Health</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ e, client, m }) => {
            const h = healthOf(m);
            return (
              <tr key={e.id} onClick={() => navigate(`/engagements/${e.id}`)} className="border-b border-tint last:border-0 hover:bg-fog cursor-pointer transition-colors">
                <td className="px-4 py-3 font-medium text-ink">
                  {client?.name} {e.incharge && <span className="ml-2 text-xs text-slate-400 font-normal">{e.incharge}</span>}
                </td>
                <td className="px-4 py-3 text-slate-500 tabular-nums">{e.year}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-fog rounded-full overflow-hidden">
                      <div className="h-full bg-green rounded-full" style={{ width: m.pct + '%' }} />
                    </div>
                    <span className="text-xs text-slate-500 tabular-nums w-8">{m.pct}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{m.outstandingCount || <span className="text-slate-300">0</span>}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{m.review || <span className="text-slate-300">0</span>}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${m.daysLeft != null && m.daysLeft < 0 && m.pct < 100 ? 'text-deep font-medium' : m.daysLeft != null && m.daysLeft <= 7 && m.pct < 100 ? 'text-green' : 'text-slate-500'}`} title={e.deadline || 'No deadline set'}>
                  {m.pct === 100 ? '—' : m.daysLeft == null ? <span className="text-slate-300">—</span> : m.daysLeft < 0 ? `${-m.daysLeft}d over` : m.daysLeft === 0 ? 'today' : `${m.daysLeft}d`}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${h.cls}`}>{h.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  const [filter, setFilter] = useState('all');
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

  async function complete(itemId) {
    try {
      const patch = withStatus({ status: itemsFlat.find((x) => x.id === itemId)?.status }, 'Completed');
      await api.items.update(itemId, patch);
      toast('Marked complete', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (loading) return <div className="stagger p-8 max-w-5xl"><div className="text-sm text-slate-400">Loading…</div></div>;

  const rows = engagements.map((e) => {
    const client = clients.find((c) => c.id === e.clientId);
    const items = itemsByEng[e.id] || [];
    const m = engMetrics({ ...e, items }, inboxByEng[e.id] || []);
    return { e, client, items, m };
  });
  const itemsFlat = rows.flatMap((r) => r.items);

  if (user?.role === 'student') return <StudentDashboardBody rows={rows} toast={toast} reload={load} />;

  const totalOutstanding = rows.reduce((s, r) => s + r.m.outstandingCount, 0);
  const toReview = rows.reduce((s, r) => s + r.m.review, 0);
  const filesToMatch = rows.reduce((s, r) => s + r.m.files, 0);
  const flaggedCount = rows.reduce((s, r) => s + r.items.filter((it) => it.headIncluded && progressTier(it)).length, 0);

  const attention = [];
  for (const { e, client, items } of rows) {
    for (const it of items) {
      if (!it.headIncluded || it.status === 'Completed' || it.status === 'NA') continue;
      const tier = progressTier(it);
      const awaited = it.requestable && isAwaited(it);
      const review = it.status === 'Under Review';
      if (!tier && !awaited && !review) continue;
      const age = review ? daysBetweenSafe(it.dateReceived, td) : awaited ? daysBetweenSafe(it.queried ? it.dateQueried : it.dateRequested, td) : noProgressDays(it);
      attention.push({ kind: 'doc', e, client, it, tier, awaited, review, age, who: it.owner || e.incharge || '' });
    }
    for (const f of (inboxByEng[e.id] || [])) {
      if (f.assignedItemId) continue;
      const age = daysBetweenSafe(f.receivedAt ? f.receivedAt.slice(0, 10) : null, td);
      attention.push({ kind: 'file', e, client, f, tier: age >= 10 ? 'flag' : age >= 3 ? 'watch' : null, age, who: e.incharge || '' });
    }
  }
  const isMine = (a) => user?.name && a.who === user.name;
  const filtered = attention.filter((a) => filter === 'all' ? true :
    filter === 'mine' ? isMine(a) :
    filter === 'awaited' ? a.kind === 'doc' && a.awaited :
    filter === 'review' ? a.kind === 'doc' && a.review :
    filter === 'flagged' ? !!a.tier :
    filter === 'adhoc' ? a.kind === 'doc' && isAdhoc(a.it) :
    filter === 'files' ? a.kind === 'file' : true
  ).sort((a, b) => {
    const ra = a.tier ? RANK[a.tier] : 0, rb = b.tier ? RANK[b.tier] : 0;
    if (ra !== rb) return rb - ra;
    return (b.age || 0) - (a.age || 0);
  });

  const FILTERS = [
    ['all', 'Everything', attention.length],
    ['mine', 'Mine', attention.filter(isMine).length],
    ['awaited', 'Awaited', attention.filter((a) => a.kind === 'doc' && a.awaited).length],
    ['review', 'To review', attention.filter((a) => a.kind === 'doc' && a.review).length],
    ['flagged', 'Flagged', attention.filter((a) => !!a.tier).length],
    ['adhoc', 'Ad-hoc', attention.filter((a) => a.kind === 'doc' && isAdhoc(a.it)).length],
    ['files', 'Files to match', attention.filter((a) => a.kind === 'file').length],
  ];

  const overallPct = rows.length ? Math.round(rows.reduce((s, r) => s + r.m.pct, 0) / rows.length) : 0;

  return (
    <div className="stagger p-8 max-w-5xl">
      <header className="mb-6 flex items-end justify-between gap-6">
        <div className="flex items-center gap-5">
          {rows.length > 0 && <ProgressRing pct={overallPct} />}
          <div>
            <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Overview</h1>
            <div className="mt-3 h-px w-12 bg-green" />
            <p className="text-sm text-slate-500 mt-1">Where every client stands, then everything that is waiting on someone.</p>
          </div>
        </div>
        <div className="text-right">
          <span className="font-mono text-[11px] text-slate-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
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
          <div className="grid grid-cols-2 md:grid-cols-4 bg-fog rounded-lg divide-x divide-tint overflow-hidden mb-10">
            <Stat label="Awaited from clients" value={totalOutstanding} active={filter === 'awaited'} onClick={() => setFilter(filter === 'awaited' ? 'all' : 'awaited')} />
            <Stat label="To review" value={toReview} active={filter === 'review'} onClick={() => setFilter(filter === 'review' ? 'all' : 'review')} />
            <Stat label="Flagged" value={flaggedCount} active={filter === 'flagged'} onClick={() => setFilter(filter === 'flagged' ? 'all' : 'flagged')} />
            <Stat label="Files to match" value={filesToMatch} active={filter === 'files'} onClick={() => setFilter(filter === 'files' ? 'all' : 'files')} />
          </div>

          <section className="mb-8">
            <h2 className="font-serif text-xl font-medium text-ink mb-3">Clients</h2>
            <PortfolioTable rows={rows} navigate={navigate} />
          </section>

          <section>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className="font-serif text-xl font-medium text-ink">Needs attention</h2>
                <p className="text-xs text-slate-500 mt-0.5">Awaited, waiting for review, or sitting too long. Close things right here.</p>
              </div>
              <div className="flex gap-1 flex-wrap">
                {FILTERS.map(([k, l, n]) => (
                  <button key={k} onClick={() => setFilter(k)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filter === k ? 'bg-deep text-paper border-deep' : 'text-ink border-tint hover:bg-fog'}`}>
                    {l} <span className={filter === k ? 'text-tint' : 'text-slate-400'}>{n}</span>
                  </button>
                ))}
              </div>
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 px-1">Nothing here. Everything's either complete or moving.</p>
            ) : (
              <div className="bg-paper border border-tint rounded-xl divide-y divide-tint/60">
                {filtered.slice(0, 80).map((a) => a.kind === 'file' ? (
                  <div key={a.f.id} className={`pl-3 pr-4 py-2.5 flex items-center gap-3 hover:bg-fog border-l-4 ${edgeCls(a.tier)}`}>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/engagements/${a.e.id}`)}>
                      <div className="text-sm text-ink truncate">{a.f.filename || a.f.name}</div>
                      <div className="text-xs text-slate-400 truncate">Unmatched file · {a.client?.name} · FY{a.e.year}{a.who ? ` · ${a.who}` : ''}</div>
                    </div>
                    <span className="text-xs text-slate-400 tabular-nums w-14 text-right shrink-0">{ageLabel(a.age)}</span>
                    <button onClick={() => navigate(`/engagements/${a.e.id}`)} className="text-xs px-2 py-1 rounded-md text-green hover:bg-fog border border-tint shrink-0">Match</button>
                  </div>
                ) : (
                  <div key={a.it.id} className={`pl-3 pr-4 py-2.5 flex items-center gap-3 hover:bg-fog border-l-4 ${edgeCls(a.tier)}`}>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/engagements/${a.e.id}`)}>
                      <div className="text-sm text-ink truncate">{a.it.p}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {isAdhoc(a.it) ? 'Ad-hoc · ' : ''}{a.client?.name} · FY{a.e.year}{a.who ? ` · ${a.who}` : ''}{a.it.due ? ` · due ${a.it.due}` : ''}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${statusStyle(a.it)}`}>{statusLabel(a.it)}</span>
                    <span className="text-xs text-slate-400 tabular-nums w-14 text-right shrink-0">{a.age != null ? ageLabel(a.age) : '—'}</span>
                    {(a.review || isAdhoc(a.it)) && (
                      <button onClick={() => complete(a.it.id)} className="text-xs px-2 py-1 rounded-md text-green hover:bg-fog border border-tint shrink-0">Complete</button>
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

function daysBetweenSafe(a, b) {
  if (!a) return null;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// ---- Student view: only what's assigned to me ----
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
      <header className="mb-6 flex items-end justify-between gap-6">
        <div className="flex items-center gap-5">
          {totalMine > 0 && <ProgressRing pct={myPct} />}
          <div>
            <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">{greeting}, {firstName || 'there'}</h1>
            <div className="mt-3 h-px w-12 bg-green" />
            <p className="text-sm text-slate-500 mt-1">Your tasks and clients — nothing assigned to anyone else shows here.</p>
          </div>
        </div>
        <div className="text-right">
          <span className="font-mono text-[11px] text-slate-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
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
