import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fmtSize, statusLabel, statusStyle, today } from '../lib/metrics.js';

export default function EngagementDocuments() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [engagement, setEngagement] = useState(null);
  const [client, setClient] = useState(null);
  const [items, setItems] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cur, setCur] = useState(null);
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);
  const [matchStep, setMatchStep] = useState(null);
  const [categoryInput, setCategoryInput] = useState('');
  const [collapsedMatchedHeads, setCollapsedMatchedHeads] = useState({});

  const canDelete = user?.role === 'partner' || user?.role === 'manager';

  async function load() {
    try {
      const [eng, its, fls] = await Promise.all([api.engagements.get(id), api.items.list(id), api.inbox.list(id)]);
      setEngagement(eng);
      setItems(Array.isArray(its) ? its : []);
      setFiles(Array.isArray(fls) ? fls : []);
      if (eng.clientId) api.clients.get(eng.clientId).then(setClient).catch(() => {});
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  const unmatched = files.filter(f => !f.assignedItemId && f.status !== 'Irrelevant');
  const matched = files.filter(f => f.assignedItemId);
  const irrelevant = files.filter(f => f.status === 'Irrelevant');

  const unmatchedKey = unmatched.map(f => f.id).join(',');
  useEffect(() => {
    if (!unmatched.some(f => f.id === cur)) { setCur(unmatched[0]?.id || null); setMatchStep(null); }
  }, [unmatchedKey]);

  const headsMap = {};
  for (const it of items) {
    if (!headsMap[it.headId]) headsMap[it.headId] = { headId: it.headId, section: it.section, sub: it.sub, items: [] };
    headsMap[it.headId].items.push(it);
  }
  if (!headsMap['adhoc']) headsMap['adhoc'] = { headId: 'adhoc', section: 'Z', sub: 'Ad-hoc', items: [] };
  const includedHeads = Object.values(headsMap).filter(h => h.headId === 'adhoc' || h.items[0]?.headIncluded);

  const itemById = {};
  for (const h of includedHeads) for (const it of h.items) itemById[it.id] = it;

  const ql = q.trim().toLowerCase();
  const targets = includedHeads.flatMap(h =>
    h.items
      .filter(it => it.status !== 'NA' && (!ql || it.p.toLowerCase().includes(ql) || h.sub.toLowerCase().includes(ql)))
      .map(it => ({ it, h }))
  );
  const curFile = unmatched.find(f => f.id === cur);

  const existingCategoriesForTask = matchStep
    ? [...new Set(files.filter(f => f.assignedItemId === matchStep.itemId && f.categoryName).map(f => f.categoryName))]
    : [];

  const matchedGroups = (() => {
    const groups = {};
    for (const f of matched) {
      const it = itemById[f.assignedItemId];
      if (!it) continue;
      const h = includedHeads.find(hd => hd.items.some(i => i.id === f.assignedItemId));
      if (!h) continue;
      const key = `${h.headId}__${it.id}`;
      if (!groups[key]) groups[key] = { head: h, item: it, entries: [] };
      groups[key].entries.push(f);
    }
    return Object.values(groups);
  })();

  function openFile(f) { api.documents.open(f.id); }

  async function handleAdd(fileList) {
    setUploading(true);
    try {
      for (const f of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('engagementId', id);
        await api.documents.upload(fd);
      }
      load();
    } catch (err) { toast(err.message, 'error'); }
    finally { setUploading(false); }
  }

  async function matchFile(fileId, itemId, categoryName) {
    try {
      await api.inbox.assign(fileId, itemId, categoryName || '');
      const it = items.find(x => x.id === itemId);
      if (it && it.status !== 'Completed' && it.status !== 'NA') {
        const patch = { status: 'Under Review', queried: false };
        if (!it.dateReceived) patch.dateReceived = today();
        await api.items.update(itemId, patch);
      }
      toast('File matched to task', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function unmatchFile(fileId) {
    try { await api.inbox.unassign(fileId); load(); }
    catch (err) { toast(err.message, 'error'); }
  }

  async function removeFile(fileId) {
    try { await api.documents.delete(fileId); setFiles(prev => prev.filter(f => f.id !== fileId)); }
    catch (err) { toast(err.message, 'error'); }
  }

  async function markIrrelevant(fileId, isIrrelevant) {
    try { await api.inbox.markIrrelevant(fileId, isIrrelevant); load(); }
    catch (err) { toast(err.message, 'error'); }
  }

  function pickTask(itemId, itemLabel) { setMatchStep({ itemId, itemLabel }); setCategoryInput(''); }

  function confirmMatch(categoryName) {
    if (!matchStep || !curFile) return;
    matchFile(curFile.id, matchStep.itemId, categoryName);
    setMatchStep(null); setCategoryInput(''); setQ('');
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;

  const clientName = client?.name || '';
  const yearLabel = engagement ? `FY ${engagement.year}` : '';

  return (
    <div className="stagger p-8 max-w-5xl">
      {/* Breadcrumb */}
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
        <span className="text-slate-600">Documents</span>
      </div>

      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">{clientName || 'Documents'}</h1>
          <div className="mt-3 h-px w-12 bg-green" />
          <p className="text-sm text-slate-500 mt-1">
            Everything the client sends lands here. Tick the files that answer one request — several documents can be filed together as a single version — then choose the task.
          </p>
        </div>
        <div className="shrink-0 mt-1">
          <label className="cursor-pointer">
            <span className="inline-block text-sm px-4 py-2 rounded-md bg-green text-paper hover:bg-deep transition-colors">
              {uploading ? 'Uploading…' : 'Add files'}
            </span>
            <input type="file" multiple className="hidden" disabled={uploading} onChange={e => { if (e.target.files?.length) handleAdd(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
      </header>

      {/* KPI row */}
      <div className="mb-6 bg-fog rounded-lg overflow-hidden grid divide-x divide-tint" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { label: 'Everything', n: files.length, color: 'text-ink' },
          { label: 'Unmatched', n: unmatched.length, color: unmatched.length > 0 ? 'text-deep' : 'text-ink' },
          { label: 'Matched', n: matched.length, color: 'text-ink' },
          { label: 'Not relevant', n: irrelevant.length, color: 'text-ink' },
        ].map(({ label, n, color }) => (
          <div key={label} className={`px-4 py-3 ${n === 0 ? 'opacity-50' : ''}`}>
            <div className={`font-serif text-[24px] leading-none font-medium tabular-nums ${color}`}>{n}</div>
            <div className="text-[11px] text-slate-600 mt-1 leading-tight">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        {/* Unmatched files */}
        <div className="md:col-span-2">
          <div className="text-xs font-medium text-slate-600 mb-2">
            Unmatched <span className="font-mono text-slate-400">{unmatched.length}</span>
          </div>
          {unmatched.length === 0 ? (
            <div className="border border-dashed border-tint rounded-lg p-6 text-center text-xs text-slate-500">
              {files.length ? 'Everything is matched.' : 'Nothing received yet. Add files, or wait for WhatsApp.'}
            </div>
          ) : (
            <div className="border border-tint rounded-lg divide-y divide-tint/60 max-h-[50vh] overflow-y-auto">
              {unmatched.map(f => (
                <button
                  key={f.id}
                  onClick={() => { setCur(f.id); setMatchStep(null); }}
                  aria-pressed={cur === f.id}
                  className={`w-full text-left px-3 py-2 border-l-4 ${cur === f.id ? 'bg-fog border-green' : 'border-transparent hover:bg-fog/60'}`}
                >
                  <div className="text-sm text-ink truncate" title={f.name}>{f.name}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {fmtSize(f.size)}{f.uploadedAt ? ` · ${f.uploadedAt}` : ''}{f.source === 'whatsapp' ? ' · WhatsApp' : ''}{f.sender ? ` · ${f.sender}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
          {curFile && (
            <div className="mt-2 flex gap-3 text-xs">
              <button onClick={() => openFile(curFile)} className="text-green hover:underline underline-offset-2">Open</button>
              <button onClick={() => markIrrelevant(curFile.id, true)} className="text-slate-400 hover:text-slate-600">Not relevant</button>
              {canDelete && <button onClick={() => { if (confirm('Delete this file?')) removeFile(curFile.id); }} className="text-slate-400 hover:text-deep">Delete</button>}
            </div>
          )}
          {irrelevant.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] text-slate-400 mb-1">Not relevant ({irrelevant.length})</div>
              <div className="space-y-0.5">
                {irrelevant.map(f => (
                  <div key={f.id} className="flex items-center gap-2 text-xs text-slate-400 px-1">
                    <span className="truncate flex-1 line-through" title={f.name}>{f.name}</span>
                    <button onClick={() => markIrrelevant(f.id, false)} className="text-green hover:underline shrink-0 text-[10px]">Restore</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Task matching panel */}
        <div className="md:col-span-3">
          {!matchStep ? (
            <>
              <div className="text-xs font-medium text-slate-600 mb-1">
                {curFile ? <>Which task is <span className="text-ink">{curFile.name}</span>?</> : 'Task'}
              </div>
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Find a task, e.g. bank statement"
                aria-label="Find a task"
                disabled={!curFile}
                className="w-full mb-2 text-sm border border-tint rounded-md px-3 py-1.5 bg-paper focus:outline-none focus:border-green disabled:opacity-50"
              />
              {!curFile ? (
                <p className="text-xs text-slate-400 py-6 text-center">Add or pick a file first.</p>
              ) : targets.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No document task matches{ql ? ` "${q}"` : ''}.</p>
              ) : (
                <div className="border border-tint rounded-lg divide-y divide-tint/60 max-h-[50vh] overflow-y-auto">
                  {targets.slice(0, 120).map(({ it, h }) => (
                    <button key={it.id} onClick={() => pickTask(it.id, it.p)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-fog text-left">
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-ink truncate">{it.p}</span>
                        <span className="block text-xs text-slate-400 truncate">{h.sub}</span>
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${statusStyle(it)}`}>{statusLabel(it)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setMatchStep(null)} className="text-[10px] text-slate-400 hover:text-green">← Back</button>
                <div className="text-xs font-medium text-slate-600 truncate flex-1">File category within <span className="text-ink">{matchStep.itemLabel}</span></div>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">Choose an existing category to add a new version, or name a new category.</p>

              {existingCategoriesForTask.length > 0 && (
                <div className="mb-3 space-y-1">
                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide mb-1.5">Existing categories</div>
                  {existingCategoriesForTask.map(cat => (
                    <button
                      key={cat}
                      onClick={() => confirmMatch(cat)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-tint hover:border-green hover:bg-fog text-left transition-colors"
                    >
                      <svg className="shrink-0 text-slate-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <span className="text-sm text-ink flex-1 truncate">{cat}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">Add new version</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide mb-1.5">New category</div>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={categoryInput}
                  onChange={e => setCategoryInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && categoryInput.trim()) confirmMatch(categoryInput.trim()); }}
                  placeholder="e.g. Bank statements, Trial balance…"
                  className="flex-1 border border-tint rounded px-3 py-1.5 text-sm bg-paper focus:outline-none focus:border-green"
                />
                <button
                  onClick={() => confirmMatch(categoryInput.trim())}
                  disabled={!categoryInput.trim()}
                  className="px-4 py-1.5 bg-green text-paper text-sm rounded hover:bg-deep disabled:opacity-50 transition-colors"
                >Match</button>
              </div>
              <button onClick={() => confirmMatch('')} className="mt-2 text-xs text-slate-400 hover:text-slate-600">
                Skip category — just match to task
              </button>
            </>
          )}

          {/* Matched documents */}
          {matched.length > 0 && (
            <div className="mt-5 border-t border-tint pt-4">
              <div className="text-xs font-medium text-slate-600 mb-2">
                Matched documents <span className="font-mono text-slate-400">{matched.length}</span>
              </div>
              <div className="space-y-1">
                {matchedGroups.map(({ head, item: taskItem, entries }) => {
                  const key = `${head.headId}__${taskItem.id}`;
                  const isCollapsed = collapsedMatchedHeads[key] !== false;
                  const catGroups = {};
                  for (const f of entries) {
                    const cat = f.categoryName || '';
                    if (!catGroups[cat]) catGroups[cat] = [];
                    catGroups[cat].push(f);
                  }
                  return (
                    <div key={key} className="border border-tint rounded-lg overflow-hidden">
                      <button
                        onClick={() => setCollapsedMatchedHeads(p => ({ ...p, [key]: !isCollapsed }))}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-fog/40 hover:bg-fog text-left transition-colors"
                      >
                        <span className={`text-[10px] text-slate-400 transition-transform duration-150 ${isCollapsed ? '-rotate-90' : ''}`}>▾</span>
                        <span className="text-xs font-medium text-ink flex-1 min-w-0 truncate">{taskItem.p}</span>
                        <span className="text-[10px] text-slate-400 shrink-0 mr-1">{head.sub}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">{entries.length} file{entries.length !== 1 ? 's' : ''}</span>
                      </button>
                      {!isCollapsed && (
                        <div className="border-t border-tint">
                          {Object.entries(catGroups).map(([cat, catFiles]) => (
                            <div key={cat || '__none'}>
                              {cat && (
                                <div className="px-3 py-1 bg-fog/20 border-b border-tint/40 flex items-center gap-1.5">
                                  <svg className="shrink-0 text-slate-400" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                  </svg>
                                  <span className="text-[11px] text-slate-500 font-medium">{cat}</span>
                                </div>
                              )}
                              <div className="divide-y divide-tint/60">
                                {catFiles.map((f, idx) => (
                                  <div key={f.id} className="px-3 py-2 flex items-center gap-3">
                                    <span className="text-[10px] text-slate-400 shrink-0 w-6 tabular-nums">v{idx + 1}</span>
                                    <button onClick={() => openFile(f)} className="text-sm text-ink hover:text-green hover:underline underline-offset-2 truncate flex-1 text-left min-w-0">{f.name}</button>
                                    <button onClick={() => unmatchFile(f.id)} className="text-xs text-slate-400 hover:text-ink shrink-0">Unmatch</button>
                                    {canDelete && <button onClick={() => { if (confirm('Delete this file?')) removeFile(f.id); }} className="text-xs text-slate-400 hover:text-deep shrink-0">Delete</button>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
