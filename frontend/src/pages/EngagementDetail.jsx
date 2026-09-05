import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import Btn from '../components/Btn.jsx';
import EditableText from '../components/EditableText.jsx';
import OwnerSelect from '../components/OwnerSelect.jsx';
import StatusSelect from '../components/StatusSelect.jsx';
import {
  today, isAdhoc, owedToUs, progressTier, noProgressDays, ageLabel, TIER_STYLE,
  engMetrics, withStatus, composeMessage, afterSend, normalizePhone, fmtSize,
  statusLabel, statusStyle, sectionLabel,
} from '../lib/metrics.js';

const STAGES = [
  ['request', 'To request', 'Not yet asked of the client'],
  ['awaited', 'Awaited', 'Asked; waiting on the client'],
  ['review', 'To review', 'Received; needs a check'],
  ['internal', 'Not started', 'Team work not yet begun'],
  ['complete', 'Complete', 'Signed off'],
];

function stageOf(it) {
  if (!it.headIncluded || it.status === 'NA') return null;
  if (it.status === 'Completed') return 'complete';
  if (it.status === 'Under Review') return 'review';
  if (it.requestable && (it.status === 'Requested' || it.queried)) return 'awaited';
  if (it.requestable) return 'request';
  return 'internal';
}

// ---- Item row ----
function ItemRow({ it, team, canEdit, onChange, engagementId, selectMode, selected, onToggleSel, onRemove }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const tier = progressTier(it);
  const edge = it.status === 'NA' ? 'border-transparent' : tier ? { watch: 'border-tint', flag: 'border-green', urgent: 'border-deep' }[tier] : it.status === 'Completed' ? 'border-tint' : 'border-transparent';
  const isDone = it.status === 'Completed';
  const overdue = it.due && it.due < today() && !isDone && it.status !== 'NA';
  const hasFile = !!it.fileNote;

  async function uploadFile(file) {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('engagementId', engagementId);
    fd.append('itemId', it.id);
    try {
      await api.documents.upload(fd);
      const done = it.status === 'Completed' || it.status === 'NA';
      await onChange({ fileNote: file.name, status: done ? it.status : 'Under Review', dateReceived: it.dateReceived || today(), queried: false });
      toast('File uploaded', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={`group pl-3 pr-4 py-2 border-l-4 ${edge} ${it.status === 'NA' ? 'opacity-40' : ''} ${selected ? 'bg-fog/60' : ''} transition-colors`}>
      <div className="flex items-center gap-3">
        {selectMode && <input type="checkbox" checked={!!selected} onChange={onToggleSel} title="Select this task" className="shrink-0 accent-green" />}
        <span className="font-mono text-[11px] text-slate-400 w-11 shrink-0">{it.ref !== '•' && it.ref !== '+' ? it.ref : ''}</span>
        <span className="w-4 shrink-0 flex items-center justify-center" title={hasFile ? `File: ${it.fileNote}` : isDone ? 'Completed with no file on record' : it.requestable ? 'Client sends this' : 'Team does this'}>
          {hasFile ? (
            <span className="text-green">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </span>
          ) : isDone ? (
            <span className="w-2.5 h-2.5 rounded-full border border-green" />
          ) : (
            <span className={`w-1.5 h-1.5 rounded-full ${it.requestable ? 'bg-tint' : 'bg-deep/40'}`} />
          )}
        </span>
        <span className={`flex-1 min-w-0 text-sm ${isDone ? 'text-slate-500' : 'text-ink'} ${it.status === 'NA' ? 'line-through' : ''}`}>
          <span className="truncate block">
            {it.p}
            {it.due && !isDone && it.status !== 'NA' && (
              <span className={`ml-1.5 text-[10px] ${overdue ? 'text-deep font-medium' : 'text-slate-400'}`}>{overdue ? 'overdue ' : 'due '}{it.due}</span>
            )}
          </span>
        </span>
        {tier && !selectMode && <span className={`text-[10px] tabular-nums shrink-0 ${TIER_STYLE[tier].text}`} title="Days since last progress">{ageLabel(noProgressDays(it))}</span>}
        {it.status !== 'NA' && canEdit && <OwnerSelect value={it.owner} team={team} onChange={(v) => onChange({ owner: v })} />}
        {canEdit ? <StatusSelect it={it} onChange={(v) => onChange(withStatus(it, v))} /> : (
          <span className={`text-[11px] rounded-full border px-2.5 py-0.5 shrink-0 ${statusStyle(it)}`}>{statusLabel(it)}</span>
        )}
        <button onClick={() => setOpen(!open)} title="Details" className="text-slate-300 hover:text-slate-600 w-5 shrink-0 text-center">{open ? '▾' : '⋯'}</button>
      </div>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-2 pb-1" style={{ paddingLeft: '3.75rem' }}>
          <label className="text-xs text-slate-500">
            File
            {hasFile ? (
              <div className="mt-0.5 flex items-center gap-2 border border-tint rounded px-2 py-1 bg-paper">
                <span className="text-xs text-ink truncate flex-1" title={it.fileNote}>{it.fileNote}</span>
                {canEdit && <button onClick={() => onChange({ fileNote: '' })} className="text-xs text-slate-300 hover:text-deep" title="Clear reference">✕</button>}
              </div>
            ) : canEdit ? (
              <label className="mt-0.5 block cursor-pointer text-xs text-green border border-dashed border-tint rounded px-2 py-1 hover:border-green hover:bg-fog text-center">
                {uploading ? 'Uploading…' : 'Upload a file'}
                <input type="file" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
              </label>
            ) : <div className="mt-0.5 text-xs text-slate-400">No file</div>}
          </label>
          <label className="text-xs text-slate-500">
            W.P. ref / note
            {canEdit ? <EditableText value={it.fileNote || ''} onSave={(v) => onChange({ fileNote: v })} placeholder="working-paper reference…" className="w-full mt-0.5 text-xs" />
              : <div className="mt-0.5 text-xs text-ink">{it.fileNote || '—'}</div>}
          </label>
          <label className="text-xs text-slate-500 col-span-2">
            Remarks
            {canEdit ? <EditableText value={it.remarks || ''} onSave={(v) => onChange({ remarks: v })} placeholder="add a remark…" className="w-full mt-0.5 text-xs" />
              : <div className="mt-0.5 text-xs text-ink">{it.remarks || '—'}</div>}
          </label>
          <div className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
            <label className="flex items-center gap-2">
              Received on
              <input type="date" value={it.dateReceived || ''} max={today()} disabled={!canEdit} onChange={(e) => onChange({ dateReceived: e.target.value })} className="border border-tint rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-green disabled:opacity-60" />
            </label>
            <label className="flex items-center gap-2">
              Due
              <input type="date" value={it.due || ''} disabled={!canEdit} onChange={(e) => onChange({ due: e.target.value })} className="border border-tint rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-green disabled:opacity-60" />
            </label>
            {canEdit && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={!!it.requestable} onChange={(e) => onChange({ requestable: e.target.checked })} />
                Client sends this
              </label>
            )}
          </div>
          <div className="col-span-2 flex items-center gap-4 text-xs text-slate-400">
            {it.dateRequested && <span>Requested {it.dateRequested}</span>}
            {it.followups > 0 && <span>{it.followups} reminder{it.followups > 1 ? 's' : ''}</span>}
            <span className="flex-1" />
            {onRemove && <button onClick={onRemove} className="text-slate-400 hover:text-deep">Delete task</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function AddAdhoc({ onAdd, placeholder, label }) {
  const [v, setV] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="px-4 py-1.5 text-xs text-green hover:bg-fog w-full text-left">{label || '+ Add item'}</button>;
  const go = () => { if (v.trim()) { onAdd(v.trim()); setV(''); setOpen(false); } };
  return (
    <div className="px-4 py-2 flex gap-2">
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') { setV(''); setOpen(false); } }} placeholder={placeholder || 'Extra document needed…'} className="flex-1 border border-tint rounded px-2 py-1 text-xs focus:outline-none focus:border-green" />
      <Btn size="sm" onClick={go}>Add</Btn>
      <Btn size="sm" kind="ghost" onClick={() => { setV(''); setOpen(false); }}>Cancel</Btn>
    </div>
  );
}

function ScopePanel({ orderedHeads, setHeadIncluded, onClose, updateItem }) {
  const [openHead, setOpenHead] = useState(null);
  const bySection = {};
  for (const h of orderedHeads) (bySection[h.section] = bySection[h.section] || []).push(h);
  const included = orderedHeads.filter((h) => h.items[0]?.headIncluded);
  const totals = included.reduce((acc, h) => {
    h.items.forEach((it) => { if (it.status !== 'NA') (it.requestable ? acc.client++ : acc.team++); });
    return acc;
  }, { client: 0, team: 0 });

  return (
    <Modal title="Scope — which areas apply to this client" onClose={onClose} wide>
      <div className="flex items-start justify-between gap-4 mb-4">
        <p className="text-xs text-slate-600 max-w-lg">
          Switch a heading on or off for this client. Inside a heading, each task is <span className="text-green font-medium">Client</span> (goes into WhatsApp requests)
          or <span className="text-deep font-medium">Team work</span> (our team does it). Open a heading to change that per task for this client only.
        </p>
        <div className="text-right shrink-0 text-xs text-slate-600">
          <div><span className="font-mono text-green text-base">{totals.client}</span> client tasks in scope</div>
          <div><span className="font-mono text-deep text-base">{totals.team}</span> team work tasks in scope</div>
        </div>
      </div>
      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
        {Object.entries(bySection).map(([sec, hs]) => (
          <div key={sec}>
            <div className="text-xs font-medium text-slate-600 mb-2">{sectionLabel(sec)}</div>
            <div className="space-y-1.5">
              {hs.map((h) => {
                const on = h.items[0]?.headIncluded;
                const c = h.items.filter((i) => i.requestable).length;
                const t = h.items.length - c;
                const open = openHead === h.headId;
                return (
                  <div key={h.headId} className={`rounded-lg border ${on ? 'border-green bg-fog/50' : 'border-tint bg-paper'}`}>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button onClick={() => setHeadIncluded(h.headId, !on)} aria-pressed={on} className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 ${on ? 'bg-green text-paper' : 'bg-tint text-transparent'}`} title={on ? 'In scope — click to remove' : 'Out of scope — click to include'}>✓</button>
                      <span className={`flex-1 text-sm ${on ? 'text-ink' : 'text-slate-500'}`}>{h.sub}</span>
                      <span className="text-xs tabular-nums text-slate-500 shrink-0"><span className="text-green">{c} client</span> · <span className="text-deep">{t} team</span></span>
                      <button onClick={() => setOpenHead(open ? null : h.headId)} className="text-xs text-slate-500 hover:text-ink w-14 text-right" aria-expanded={open}>{open ? 'Close' : 'Tasks'}</button>
                    </div>
                    {open && (
                      <div className="border-t border-tint divide-y divide-tint/60">
                        {h.items.map((it) => (
                          <div key={it.id} className="px-3 py-1.5 flex items-center gap-3">
                            <span className="font-mono text-[11px] text-slate-500 w-11 shrink-0">{it.ref !== '•' && it.ref !== '+' ? it.ref : ''}</span>
                            <span className={`flex-1 text-sm ${it.status === 'NA' ? 'line-through text-slate-400' : 'text-ink'}`}>{it.p}</span>
                            <div className="flex rounded-md border border-tint overflow-hidden text-[11px] shrink-0" role="group" aria-label="Who provides this">
                              <button onClick={() => updateItem(it.id, { requestable: true })} className={`px-2 py-0.5 ${it.requestable ? 'bg-green text-paper' : 'text-ink hover:bg-fog'}`}>Client</button>
                              <button onClick={() => updateItem(it.id, { requestable: false })} className={`px-2 py-0.5 border-l border-tint ${!it.requestable ? 'bg-deep text-paper' : 'text-ink hover:bg-fog'}`}>Team work</button>
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
        ))}
      </div>
      <div className="flex justify-end pt-4"><Btn onClick={onClose}>Done</Btn></div>
    </Modal>
  );
}

function ComposeModal({ compose, setCompose, phone, onConfirm }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(compose.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }
  const parts = [
    compose.fresh.length && `${compose.fresh.length} new request${compose.fresh.length > 1 ? 's' : ''}`,
    compose.awaited.length && `${compose.awaited.length} reminder${compose.awaited.length > 1 ? 's' : ''}`,
    compose.resend.length && `${compose.resend.length} resend${compose.resend.length > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ');
  return (
    <Modal title="Message client" onClose={() => setCompose(null)} wide>
      <p className="text-xs text-slate-500 mb-3">
        {parts} · to +{phone || '—'}. Edit the wording if you like. New requests move to Awaited when you send; reminders are counted.
        {compose.skipped > 0 && <span className="text-slate-400"> {compose.skipped} ticked item{compose.skipped > 1 ? 's' : ''} left out — received, complete, N/A or team work.</span>}
      </p>
      <textarea value={compose.text} onChange={(e) => setCompose({ ...compose, text: e.target.value })} className="w-full h-64 border border-tint rounded-lg p-3 text-sm font-mono text-ink bg-fog focus:outline-none resize-none" />
      <div className="flex items-center justify-between pt-4">
        <Btn kind="ghost" onClick={copy}>{copied ? 'Copied ✓' : 'Copy text'}</Btn>
        <div className="flex gap-2">
          <Btn kind="ghost" onClick={() => setCompose(null)}>Cancel</Btn>
          <Btn kind="ghost" onClick={() => onConfirm(false)} title="Record this as sent without opening WhatsApp">Mark as sent</Btn>
          <Btn onClick={() => onConfirm(true)} disabled={!phone}>Open WhatsApp</Btn>
        </div>
      </div>
      {!phone && <p className="text-xs text-deep mt-2 text-right">No WhatsApp number on file — add one on the Clients page, or use Mark as sent.</p>}
    </Modal>
  );
}

function FilesModal({ engagementId, files, heads, onClose, onAdd, onMatch, onUnmatch, onRemove, canDelete }) {
  const unmatched = files.filter((f) => !f.assignedItemId);
  const matched = files.filter((f) => f.assignedItemId);
  const [cur, setCur] = useState(unmatched[0]?.id || null);
  const [q, setQ] = useState('');
  const [showMatched, setShowMatched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const unmatchedKey = unmatched.map((f) => f.id).join(',');
  useEffect(() => { if (!unmatched.some((f) => f.id === cur)) setCur(unmatched[0]?.id || null); }, [unmatchedKey]);

  const itemById = {};
  for (const h of heads) for (const it of h.items) itemById[it.id] = it;
  const ql = q.trim().toLowerCase();
  const targets = heads.flatMap((h) => h.items.filter((it) => it.status !== 'NA' && (!ql || it.p.toLowerCase().includes(ql) || h.sub.toLowerCase().includes(ql))).map((it) => ({ it, h })));
  const curFile = unmatched.find((f) => f.id === cur);

  async function openFile(f) {
    try { const { url } = await api.documents.downloadUrl(f.id); window.open(url, '_blank'); } catch {}
  }

  async function handleAdd(fileList) {
    setUploading(true);
    try { await onAdd(fileList); } finally { setUploading(false); }
  }

  return (
    <Modal title="Files" onClose={onClose} wide>
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-xs text-slate-600 max-w-lg">Everything the client sends lands here. Pick a file on the left, then the task it belongs to on the right; the task moves to <span className="font-medium text-ink">To review</span>.</p>
        <label className="cursor-pointer shrink-0">
          <span className="inline-block text-sm px-4 py-2 rounded-md bg-green text-paper hover:bg-deep">{uploading ? 'Uploading…' : 'Add files'}</span>
          <input type="file" multiple className="hidden" disabled={uploading} onChange={(e) => { if (e.target.files?.length) handleAdd(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
      <div className="grid md:grid-cols-5 gap-4">
        <div className="md:col-span-2">
          <div className="text-xs font-medium text-slate-600 mb-1">Unmatched <span className="font-mono text-slate-400">{unmatched.length}</span></div>
          {unmatched.length === 0 ? (
            <div className="border border-dashed border-tint rounded-lg p-6 text-center text-xs text-slate-500">{files.length ? 'Everything is matched.' : 'Nothing received yet. Add files, or wait for WhatsApp.'}</div>
          ) : (
            <div className="border border-tint rounded-lg divide-y divide-tint/60 max-h-[50vh] overflow-y-auto">
              {unmatched.map((f) => (
                <button key={f.id} onClick={() => setCur(f.id)} aria-pressed={cur === f.id} className={`w-full text-left px-3 py-2 border-l-4 ${cur === f.id ? 'bg-fog border-green' : 'border-transparent hover:bg-fog/60'}`}>
                  <div className="text-sm text-ink truncate" title={f.name}>{f.name}</div>
                  <div className="text-xs text-slate-500 truncate">{fmtSize(f.size)}{f.uploadedAt ? ` · ${f.uploadedAt}` : ''}{f.source === 'whatsapp' ? ' · WhatsApp' : ''}{f.sender ? ` · ${f.sender}` : ''}</div>
                </button>
              ))}
            </div>
          )}
          {curFile && (
            <div className="mt-2 flex gap-3 text-xs">
              <button onClick={() => openFile(curFile)} className="text-green hover:underline underline-offset-2">Open</button>
              {canDelete && <button onClick={() => { if (confirm('Delete this file?')) onRemove(curFile.id); }} className="text-slate-400 hover:text-deep">Delete</button>}
            </div>
          )}
        </div>
        <div className="md:col-span-3">
          <div className="text-xs font-medium text-slate-600 mb-1">{curFile ? <>Which task is <span className="text-ink">{curFile.name}</span>?</> : 'Task'}</div>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a task, e.g. bank statement" aria-label="Find a task" disabled={!curFile} className="w-full mb-2 text-sm border border-tint rounded-md px-3 py-1.5 bg-paper focus:outline-none focus:border-green disabled:opacity-50" />
          {!curFile ? <p className="text-xs text-slate-400 py-6 text-center">Add or pick a file first.</p>
            : targets.length === 0 ? <p className="text-xs text-slate-400 py-6 text-center">No document task matches{ql ? ` "${q}"` : ''}.</p>
            : (
              <div className="border border-tint rounded-lg divide-y divide-tint/60 max-h-[50vh] overflow-y-auto">
                {targets.slice(0, 120).map(({ it, h }) => (
                  <button key={it.id} onClick={() => { onMatch(curFile.id, it.id); setQ(''); }} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-fog text-left">
                    <span className="font-mono text-[11px] text-slate-400 w-11 shrink-0">{it.ref !== '•' && it.ref !== '+' ? it.ref : ''}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-ink truncate">{it.p}</span>
                      <span className="block text-xs text-slate-400 truncate">{h.sub}</span>
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${statusStyle(it)}`}>{statusLabel(it)}</span>
                  </button>
                ))}
              </div>
            )}
        </div>
      </div>
      {matched.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowMatched(!showMatched)} className="text-xs text-slate-500 hover:text-ink">{showMatched ? 'Hide' : 'Show'} matched files ({matched.length})</button>
          {showMatched && (
            <div className="mt-2 border border-tint rounded-lg divide-y divide-tint/60 max-h-[30vh] overflow-y-auto">
              {matched.map((f) => (
                <div key={f.id} className="px-3 py-2 flex items-center gap-3">
                  <button onClick={() => openFile(f)} className="text-sm text-ink hover:text-green hover:underline underline-offset-2 truncate flex-1 text-left" title={f.name}>{f.name}</button>
                  <span className="text-xs text-green truncate max-w-[240px]" title={itemById[f.assignedItemId]?.p}>{itemById[f.assignedItemId]?.p || 'a task'}</span>
                  <button onClick={() => onUnmatch(f.id)} className="text-xs text-slate-400 hover:text-ink shrink-0">Unmatch</button>
                  {canDelete && <button onClick={() => { if (confirm('Delete this file?')) onRemove(f.id); }} className="text-xs text-slate-400 hover:text-deep shrink-0">Delete</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end pt-4"><Btn onClick={onClose}>Done</Btn></div>
    </Modal>
  );
}

export default function EngagementDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [engagement, setEngagement] = useState(null);
  const [client, setClient] = useState(null);
  const [items, setItems] = useState([]);
  const [files, setFiles] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scoping, setScoping] = useState(false);
  const [compose, setCompose] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState({});
  const [filesOpen, setFilesOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState(null);
  const [q, setQ] = useState('');

  const canEdit = user?.role === 'partner' || user?.role === 'manager' || (user?.role === 'student' && engagement?.incharge === user?.name);
  const isPartnerManager = user?.role === 'partner' || user?.role === 'manager';
  const canDeleteFiles = isPartnerManager;
  const td = today();

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

  useEffect(() => {
    if (user?.role !== 'student') api.team.list().then((t) => setTeam(Array.isArray(t) ? t.filter((m) => m.active !== false) : [])).catch(() => {});
  }, [user]);

  async function updateItem(itemId, patch) {
    const clean = { ...patch };
    delete clean.id;
    if (!Object.keys(clean).length) return;
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...clean } : it)));
    try {
      await api.items.update(itemId, clean);
    } catch (err) {
      toast(err.message, 'error');
      load();
    }
  }

  async function removeItem(itemId) {
    try { await api.items.delete(itemId); setItems((prev) => prev.filter((it) => it.id !== itemId)); toast('Task deleted', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  }

  async function commitEng(patch) {
    setEngagement((prev) => ({ ...prev, ...patch }));
    try { await api.engagements.update(id, patch); } catch (err) { toast(err.message, 'error'); load(); }
  }

  async function setHeadIncluded(headId, val) {
    const ids = items.filter((it) => it.headId === headId).map((it) => it.id);
    setItems((prev) => prev.map((it) => (it.headId === headId ? { ...it, headIncluded: val } : it)));
    try { await api.items.bulkUpdate(ids.map((i) => ({ id: i, headIncluded: val }))); } catch (err) { toast(err.message, 'error'); load(); }
  }

  async function addFiles(fileList) {
    try {
      for (const f of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('engagementId', id);
        await api.documents.upload(fd);
      }
      const fls = await api.inbox.list(id);
      setFiles(Array.isArray(fls) ? fls : []);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function matchFile(fileId, itemId) {
    try {
      await api.inbox.assign(fileId, itemId);
      const it = items.find((x) => x.id === itemId);
      if (it && it.status !== 'Completed' && it.status !== 'NA') {
        await api.items.update(itemId, { status: 'Under Review', dateReceived: it.dateReceived || td, queried: false });
      }
      toast('File matched to task', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function unmatchFile(fileId) {
    try {
      const f = files.find((x) => x.id === fileId);
      await api.inbox.unassign(fileId);
      if (f?.assignedItemId) {
        const it = items.find((x) => x.id === f.assignedItemId);
        if (it && it.status === 'Under Review') {
          await api.items.update(it.id, { status: it.dateRequested ? 'Requested' : 'No progress' });
        }
      }
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function removeFile(fileId) {
    try { await api.documents.delete(fileId); setFiles((prev) => prev.filter((f) => f.id !== fileId)); }
    catch (err) { toast(err.message, 'error'); }
  }

  async function removeYear() {
    if (!confirm(`Remove FY ${engagement.year} for ${client?.name || 'this client'}? Its ledger and files go; the client and other years stay.`)) return;
    try { await api.engagements.delete(id); toast(`FY ${engagement.year} removed`, 'info'); navigate('/'); }
    catch (err) { toast(err.message, 'error'); }
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;
  if (!engagement) return <div className="p-8 text-slate-400">Engagement not found.</div>;

  const m = engMetrics({ ...engagement, items }, files);
  const phone = normalizePhone(client?.phone || engagement.contactPhone);

  // ---- headings, ad-hoc always last, always present ----
  const heads = {};
  for (const it of items) (heads[it.headId] = heads[it.headId] || { headId: it.headId, section: it.section, sub: it.sub, items: [] }).items.push(it);
  if (!heads['adhoc']) heads['adhoc'] = { headId: 'adhoc', section: 'Z', sub: 'Ad-hoc', items: [] };
  const seenOrder = {};
  items.forEach((it, i) => { if (seenOrder[it.headId] === undefined) seenOrder[it.headId] = i; });
  const ord = (h) => (h.headId === 'adhoc' ? 1e9 : (seenOrder[h.headId] ?? 999));
  const orderedHeads = Object.values(heads).sort((a, b) => ord(a) - ord(b));
  const libraryHeads = orderedHeads.filter((h) => h.headId !== 'adhoc');
  const includedHeads = orderedHeads.filter((h) => h.headId === 'adhoc' || h.items[0]?.headIncluded);
  const scopedIn = includedHeads.filter((h) => h.headId !== 'adhoc');

  const stageCount = {};
  items.forEach((it) => { const st = stageOf(it); if (st) stageCount[st] = (stageCount[st] || 0) + 1; });
  const naCount = items.filter((it) => it.headIncluded && it.status === 'NA').length;

  const ql = q.trim().toLowerCase();
  const visibleHeads = includedHeads
    .map((h) => ({ ...h, items: h.items.filter((it) => (stageFilter === 'na' ? it.status === 'NA' : (!stageFilter || stageOf(it) === stageFilter)) && (!ql || it.p.toLowerCase().includes(ql) || (it.ref || '').toLowerCase().includes(ql) || (it.owner || '').toLowerCase().includes(ql))) }))
    .filter((h) => h.items.length > 0 || (h.headId === 'adhoc' && !stageFilter && !ql));

  function startSelect(pick) {
    const n = {};
    items.forEach((it) => { if (!pick || pick(it)) n[it.id] = true; });
    setSel(n);
    setSelecting(true);
  }
  function stopSelect() { setSelecting(false); setSel({}); }
  const selItems = items.filter((it) => sel[it.id] && it.headIncluded);
  const preview = composeMessage(engagement, client, selItems);
  const messageable = preview.fresh.length + preview.awaited.length + preview.resend.length;
  const owed = items.filter(owedToUs).length;

  function openCompose() { if (messageable === 0) return; setCompose({ items: selItems, ...preview }); }

  async function confirmSend(openWa = true) {
    const patches = afterSend(items, compose);
    setItems((prev) => prev.map((it) => { const p = patches.find((x) => x.id === it.id); return p ? { ...it, ...p.patch } : it; }));
    try {
      await api.items.bulkUpdate(patches.map((p) => ({ id: p.id, ...p.patch })));
      if (openWa && phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(compose.text)}`, '_blank');
      toast(openWa ? 'Opening WhatsApp — requests moved to Awaited' : 'Marked as sent — requests moved to Awaited', 'success');
    } catch (err) {
      toast(err.message, 'error');
      load();
    }
    setCompose(null);
    stopSelect();
  }

  async function assignSelected(v) {
    const ids = Object.keys(sel).filter((k) => sel[k]);
    try { await api.items.bulkUpdate(ids.map((i) => ({ id: i, owner: v === '__none' ? '' : v }))); load(); }
    catch (err) { toast(err.message, 'error'); }
    stopSelect();
  }

  const nextStep = (() => {
    if (libraryHeads.length > 0 && scopedIn.length === 0) return { text: 'Start by choosing which areas apply to this client.', action: 'scope' };
    if (stageCount.request) return { text: `${stageCount.request} request${stageCount.request > 1 ? "s haven't" : " hasn't"} been sent to the client yet.`, action: 'request' };
    if (stageCount.review) return { text: `${stageCount.review} file${stageCount.review > 1 ? 's are' : ' is'} in and waiting for review.`, action: 'review' };
    if (stageCount.awaited) return { text: `Waiting on the client for ${stageCount.awaited} item${stageCount.awaited > 1 ? 's' : ''}. Send a reminder if it has been a while.`, action: 'followup' };
    if (stageCount.internal) return { text: `${stageCount.internal} item${stageCount.internal > 1 ? 's' : ''} left for the team.`, action: 'internal' };
    if (items.length === 0) return { text: 'Nothing here yet. Add a task below.', action: null };
    return { text: 'Everything for this client is complete.', action: null };
  })();

  function doNext(action) {
    if (action === 'scope') setScoping(true);
    else if (action === 'request') startSelect((it) => it.headIncluded && it.requestable && it.status === 'No progress');
    else if (action === 'followup') startSelect((it) => owedToUs(it) && it.status === 'Requested');
    else if (action === 'review') setStageFilter('review');
    else if (action === 'internal') setStageFilter('internal');
  }

  const daysLeft = m.daysLeft;
  const dueText = daysLeft == null ? '' : m.pct === 100 ? 'done' : daysLeft < 0 ? `overdue by ${-daysLeft} day${daysLeft === -1 ? '' : 's'}` : daysLeft === 0 ? 'due today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;

  return (
    <div className="stagger p-8 max-w-4xl">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="text-xs text-slate-400 hover:text-slate-600">Back to overview</button>
        {user?.role === 'partner' && (
          <button onClick={removeYear} className="text-xs text-slate-400 hover:text-deep" title="Delete this year for this client.">Remove this year</button>
        )}
      </div>

      <header className="mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em] truncate">{client?.name}</h1>
            <div className="mt-3 h-px w-12 bg-green" />
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1 text-sm text-slate-500">
              <span>FY {engagement.year}</span>
              {engagement.rolledFrom && <span className="text-xs text-green bg-fog px-2 py-0.5 rounded-full">rolled forward</span>}
              {client?.phone && <span className="text-slate-400 text-xs">+{normalizePhone(client.phone)}</span>}
              <label className="flex items-center gap-1.5 text-xs text-slate-400" title="When this year's work must be finished.">
                Due
                <input type="date" value={engagement.deadline || ''} disabled={!isPartnerManager} onChange={(e) => commitEng({ deadline: e.target.value })} className={`text-xs rounded-full border px-2 py-0.5 bg-paper focus:outline-none focus:border-green ${engagement.deadline ? 'text-ink border-tint' : 'text-slate-400 border-green'}`} />
                {dueText && <span className={daysLeft < 0 && m.pct < 100 ? 'text-deep font-medium' : daysLeft <= 7 && m.pct < 100 ? 'text-green' : 'text-slate-400'}>{dueText}</span>}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                In-charge
                <select value={engagement.incharge || ''} disabled={!isPartnerManager} onChange={(e) => commitEng({ incharge: e.target.value })} className={`text-xs rounded-full border px-2 py-0.5 bg-paper focus:outline-none focus:border-green ${engagement.incharge ? 'text-ink border-tint' : 'text-slate-400 border-green'}`}>
                  <option value="">Unassigned</option>
                  {team.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </label>
              {isPartnerManager && (
                <label className="flex items-center gap-1 text-xs text-slate-400" title="The client's WhatsApp group.">
                  Group
                  <EditableText value={engagement.waGroupId || ''} onSave={(v) => commitEng({ waGroupId: v.trim() })} placeholder="not linked" className="text-xs w-24" mono />
                </label>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-semibold text-ink tabular-nums">{m.pct}%</div>
            <div className="font-mono text-[11px] text-slate-500">{m.done} / {m.total} complete</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 bg-fog rounded-full overflow-hidden"><div className="h-full bg-green rounded-full" style={{ width: m.pct + '%' }} /></div>
      </header>

      <div className="mb-3 bg-fog rounded-lg overflow-hidden grid grid-cols-5 divide-x divide-tint">
        {STAGES.map(([key, label, hint]) => {
          const n = stageCount[key] || 0;
          const on = stageFilter === key;
          return (
            <button key={key} onClick={() => setStageFilter(on ? null : key)} title={hint} className={`text-left px-4 py-3 transition-colors ${on ? 'bg-paper' : 'hover:bg-paper/60'} ${n === 0 ? 'opacity-50' : ''}`}>
              <div className={`font-serif text-[26px] leading-none font-medium tabular-nums ${on || key === 'complete' ? 'text-green' : 'text-ink'}`}>{n}</div>
              <div className="text-xs text-slate-600 mt-1">{label}</div>
            </button>
          );
        })}
      </div>

      <div className="mb-5 flex items-center gap-3 flex-wrap text-sm">
        <span className="text-ink">
          <span className="text-slate-500">Next:</span>{' '}
          {nextStep.action && isPartnerManager
            ? <button onClick={() => doNext(nextStep.action)} className="text-left text-ink hover:text-green underline decoration-tint underline-offset-4">{nextStep.text}</button>
            : nextStep.text}
        </span>
        {stageFilter && <button onClick={() => setStageFilter(null)} className="text-xs text-green hover:underline underline-offset-2">Show all</button>}
        {naCount > 0 && stageFilter !== 'na' && <button onClick={() => setStageFilter('na')} className="text-xs text-slate-500 hover:text-ink" title="Not applicable to this client.">{naCount} N/A</button>}
      </div>

      {canEdit && (
        <div className="sticky top-0 z-20 -mx-8 px-8 py-3 mb-4 bg-paper border-b border-tint flex flex-wrap items-center gap-2">
          {selecting ? <Btn onClick={stopSelect} kind="ghost">Cancel</Btn> : (
            <>
              <Btn onClick={() => startSelect(owedToUs)} disabled={owed === 0} title={owed ? `Everything the client owes (${owed}) is ticked; untick what you don't want to send.` : 'The client owes nothing right now'}>
                Message client{owed ? <span className="ml-2 text-[11px] font-normal text-paper/80 tabular-nums">{owed}</span> : null}
              </Btn>
              <Btn onClick={() => startSelect(null)} kind="ghost" title="Tick tasks to assign them to someone, or to message a custom set">Select</Btn>
            </>
          )}
          <Btn onClick={() => setFilesOpen(true)} kind="ghost" title="Files the client sent. Match each one to its task.">
            Files{m.files > 0 ? <span className="ml-2 text-[11px] font-medium text-paper bg-green rounded-full px-1.5 py-px tabular-nums">{m.files}</span> : files.length > 0 ? <span className="ml-2 text-[11px] text-slate-400 tabular-nums">{files.length}</span> : null}
          </Btn>
          {libraryHeads.length > 0 && <Btn onClick={() => setScoping(true)} kind="ghost" title="Choose which areas apply to this client">Scope</Btn>}
          <div className="flex-1" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a task" aria-label="Find a task in this ledger" className="text-sm border border-tint rounded-md px-3 py-1.5 bg-paper w-40 focus:outline-none focus:border-green" />
          {scopedIn.length > 1 && (
            <button onClick={() => { const all = scopedIn.every((h) => collapsed[h.headId]); const next = {}; scopedIn.forEach((h) => (next[h.headId] = !all)); setCollapsed(next); }} className="text-xs text-slate-400 hover:text-ink">
              {scopedIn.every((h) => collapsed[h.headId]) ? 'Expand all' : 'Collapse all'}
            </button>
          )}
        </div>
      )}

      {selecting && (
        <div className="mb-4 rounded-lg border border-tint bg-fog px-4 py-2.5 text-sm text-ink flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>Tick tasks — one at a time or a whole heading — then message the client or assign them from the bar below.</span>
          <span className="flex-1" />
          <button onClick={() => startSelect(owedToUs)} className="text-xs text-green hover:underline underline-offset-2">Everything owed</button>
          <button onClick={() => startSelect((it) => it.headIncluded && it.requestable && it.status === 'No progress')} className="text-xs text-green hover:underline underline-offset-2">Not yet requested</button>
          <button onClick={() => startSelect((it) => owedToUs(it) && it.status === 'Requested')} className="text-xs text-green hover:underline underline-offset-2">Awaited</button>
          <button onClick={() => setSel({})} className="text-xs text-slate-600 hover:underline underline-offset-2">Clear</button>
        </div>
      )}

      {libraryHeads.length === 0 && items.length === 0 && (
        <p className="mb-4 text-sm text-slate-500">This library is empty, so this year has no standard tasks. Add categories and tasks in Library, or just add tasks below.</p>
      )}
      {libraryHeads.length > 0 && scopedIn.length === 0 && (
        <div className="mb-4 border border-dashed border-tint rounded-xl p-6 text-center">
          <p className="text-sm text-ink">No areas scoped in yet.</p>
          <p className="text-xs text-slate-400 mt-1 mb-3">Choose which financial-statement areas apply to this client.</p>
          {isPartnerManager && <Btn onClick={() => setScoping(true)}>Choose areas</Btn>}
        </div>
      )}

      <section aria-label="Tasks" className="space-y-2">
        {visibleHeads.length === 0 && <p className="text-sm text-slate-500 py-4 px-1">No tasks here.</p>}
        {visibleHeads.map((h) => {
          const adhoc = h.headId === 'adhoc';
          const isC = collapsed[h.headId] && !ql && !stageFilter;
          const hm = { done: h.items.filter((i) => i.status === 'Completed').length, total: h.items.filter((i) => i.status !== 'NA').length };
          return (
            <div key={h.headId} className="bg-paper border border-tint rounded-lg overflow-hidden">
              <div className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-fog/60">
                {selecting && h.items.length > 0 && (() => {
                  const ids = h.items.map((it) => it.id);
                  const all = ids.every((idx) => sel[idx]);
                  const some = ids.some((idx) => sel[idx]);
                  return <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = !all && some; }} onChange={() => { const n = { ...sel }; ids.forEach((idx) => { n[idx] = !all; }); setSel(n); }} title="Select every task under this heading" className="accent-green shrink-0" />;
                })()}
                <button onClick={() => setCollapsed({ ...collapsed, [h.headId]: !isC })} className="flex items-center gap-3 flex-1 text-left">
                  <span className="text-slate-300 text-xs w-3">{isC ? '▸' : '▾'}</span>
                  <span className="font-serif font-medium text-ink text-[16px] flex-1">{h.sub}{adhoc && <span className="ml-2 text-xs font-sans font-normal text-slate-400">tasks for this client outside the standard list</span>}</span>
                  {hm.total > 0 && <span className="w-20 h-1 bg-fog rounded-full overflow-hidden hidden sm:block"><span className="block h-full bg-green rounded-full" style={{ width: (hm.done / hm.total) * 100 + '%' }} /></span>}
                  <span className="text-xs text-slate-400 tabular-nums w-10 text-right">{hm.total > 0 ? `${hm.done}/${hm.total}` : ''}</span>
                </button>
              </div>
              {!isC && (
                <div className="divide-y divide-tint/60 border-t border-tint">
                  {h.items.map((it) => (
                    <ItemRow
                      key={it.id} it={it} team={team} canEdit={canEdit} engagementId={id}
                      selectMode={selecting} selected={!!sel[it.id]} onToggleSel={() => setSel((s) => ({ ...s, [it.id]: !s[it.id] }))}
                      onChange={(patch) => updateItem(it.id, patch)}
                      onRemove={canEdit && isAdhoc(it) ? () => { if (confirm(`Delete "${it.p}"? The Activity log keeps a trace.`)) removeItem(it.id); } : null}
                    />
                  ))}
                  {canEdit && (
                    <AddAdhoc
                      placeholder={adhoc ? 'Add a task for this client…' : 'Extra document needed under this heading…'}
                      label={adhoc ? '+ Add task' : '+ Add item'}
                      onAdd={(p) => api.items.addAdhoc(adhoc
                        ? { engagementId: id, p, owner: engagement.incharge || '' }
                        : { engagementId: id, p, headId: h.headId, section: h.section, sub: h.sub, requestable: true }
                      ).then(load).catch((err) => toast(err.message, 'error'))}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {selecting && selItems.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-paper border border-tint rounded-full pl-5 pr-2 py-2 flex items-center gap-3">
          <span className="text-sm text-ink tabular-nums">{selItems.length} selected</span>
          <span className="text-xs text-slate-400">Assign to</span>
          <select value="" aria-label="Assign selected tasks to" onChange={(e) => { if (e.target.value) assignSelected(e.target.value); }} className="text-xs border border-tint rounded-md px-2 py-1 bg-paper focus:outline-none focus:border-green">
            <option value="">choose…</option>
            {team.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            <option value="__none">nobody</option>
          </select>
          <span className="w-px h-5 bg-tint" />
          <span className="text-xs text-slate-400 tabular-nums" title="What the message will contain">
            {[preview.fresh.length && `${preview.fresh.length} new`, preview.awaited.length && `${preview.awaited.length} reminder${preview.awaited.length > 1 ? 's' : ''}`, preview.resend.length && `${preview.resend.length} resend`].filter(Boolean).join(' · ') || 'nothing to send'}
          </span>
          <Btn size="sm" onClick={openCompose} disabled={messageable === 0} title={messageable ? "Write the message from what's ticked" : 'Nothing ticked can be messaged'}>Message client</Btn>
        </div>
      )}

      {scoping && <ScopePanel orderedHeads={libraryHeads} setHeadIncluded={setHeadIncluded} updateItem={updateItem} onClose={() => setScoping(false)} />}
      {compose && <ComposeModal compose={compose} setCompose={setCompose} phone={phone} onConfirm={confirmSend} />}
      {filesOpen && (
        <FilesModal
          engagementId={id} files={files} heads={includedHeads} onClose={() => setFilesOpen(false)}
          onAdd={addFiles} onMatch={matchFile} onUnmatch={unmatchFile} onRemove={removeFile} canDelete={canDeleteFiles}
        />
      )}
    </div>
  );
}
