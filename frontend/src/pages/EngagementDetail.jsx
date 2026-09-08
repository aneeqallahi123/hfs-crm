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

// ---- Per-file row (inside expanded ItemRow) ----
function FileRow({ file, canEdit, downloading, removing, onOpen, onRemove, onNoteChange }) {
  const [note, setNote] = useState(file.note || '');
  const [savingNote, setSavingNote] = useState(false);
  const dirty = note !== (file.note || '');

  // keep in sync if parent refreshes
  React.useEffect(() => { setNote(file.note || ''); }, [file.note]);

  async function saveNote() {
    if (!dirty) return;
    setSavingNote(true);
    try { await api.inbox.updateNote(file.id, note); onNoteChange(note); }
    catch { setNote(file.note || ''); }
    finally { setSavingNote(false); }
  }

  // source: 'whatsapp' → came from client; anything else → uploaded internally
  const fromClient = file.source === 'whatsapp';

  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  }

  return (
    <div className="group/file rounded border border-tint bg-paper hover:border-slate-300 transition-colors overflow-hidden">
      {/* Top row: icon + name + source + date + remove */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <svg className="shrink-0 text-slate-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
        <button
          onClick={onOpen}
          disabled={downloading}
          className="flex-1 text-xs text-left text-green hover:underline underline-offset-2 truncate min-w-0 disabled:opacity-60"
          title={file.name}
        >
          {downloading ? 'Opening…' : file.name}
        </button>
        {/* Source badge */}
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium ${fromClient ? 'bg-green/10 text-green' : 'bg-slate-100 text-slate-500'}`}>
          {fromClient ? 'Client' : 'Internal'}
        </span>
        {file.uploadedAt && (
          <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">{fmtDate(file.uploadedAt)}</span>
        )}
        {canEdit && (
          <button
            onClick={onRemove}
            disabled={removing}
            className="shrink-0 w-4 h-4 flex items-center justify-center text-[10px] text-slate-300 hover:text-deep rounded transition-colors opacity-0 group-hover/file:opacity-100 disabled:opacity-40"
            title="Remove this file"
          >
            {removing ? '…' : '✕'}
          </button>
        )}
      </div>
      {/* Note row */}
      <div className="px-2.5 pb-2 flex items-center gap-2 border-t border-tint/40 pt-1.5">
        <span className="text-[10px] text-slate-400 shrink-0">Note</span>
        {canEdit ? (
          <>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              placeholder="W.P. ref, source detail, or remark about this file…"
              className="flex-1 text-xs bg-transparent text-ink placeholder-slate-300 border border-transparent hover:border-tint focus:border-green focus:bg-paper rounded px-1.5 py-0.5 focus:outline-none min-w-0"
            />
            {savingNote && <span className="text-[10px] text-slate-400 shrink-0">saving…</span>}
          </>
        ) : (
          <span className="text-xs text-ink flex-1">{file.note || <span className="text-slate-400">—</span>}</span>
        )}
      </div>
    </div>
  );
}

function parseValues(raw) {
  if (!raw) return [''];
  try { const a = JSON.parse(raw); return Array.isArray(a) && a.length ? a : [raw]; } catch { return [raw]; }
}

// ---- Item row ----
function ItemRow({ it, team, canEdit, onChange, engagementId, selectMode, selected, onToggleSel, onRemove, itemFiles = [], onFileUploaded, onFileRemoved }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [removing, setRemoving] = useState(null);
  const fileInputRef = React.useRef(null);
  const kind = it.kind || 'document';
  const isTextType = kind === 'number' || kind === 'information';
  const [textVals, setTextVals] = useState(() => parseValues(it.value));
  React.useEffect(() => { setTextVals(parseValues(it.value)); }, [it.value]);

  async function saveTextVals(vals) {
    const cleaned = vals.map((v) => v.trim()).filter(Boolean);
    const json = cleaned.length ? JSON.stringify(cleaned) : '';
    await onChange({ value: json });
  }

  const tier = progressTier(it);
  const edge = it.status === 'NA' ? 'border-transparent' : tier ? { watch: 'border-tint', flag: 'border-green', urgent: 'border-deep' }[tier] : it.status === 'Completed' ? 'border-tint' : 'border-transparent';
  const isDone = it.status === 'Completed';
  const overdue = it.due && it.due < today() && !isDone && it.status !== 'NA';
  const fileCount = itemFiles.length;
  const hasFiles = isTextType ? textVals.some((v) => v.trim()) : fileCount > 0;

  async function uploadFile(file) {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('engagementId', engagementId);
    fd.append('itemId', it.id);
    try {
      const res = await api.documents.upload(fd);
      const rawFile = res?.file;
      const done = it.status === 'Completed' || it.status === 'NA';
      await onChange({ fileNote: file.name, status: done ? it.status : 'Under Review', dateReceived: it.dateReceived || today(), queried: false });
      if (rawFile && onFileUploaded) {
        onFileUploaded({
          id: rawFile.id,
          name: rawFile.name,
          size: rawFile.size,
          mimeType: rawFile.mime_type,
          uploadedAt: rawFile.uploaded_at,
          assignedItemId: rawFile.assigned_item_id,
          engagementId: rawFile.engagement_id,
          status: rawFile.status,
        });
      }
      toast('File uploaded', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function openFile(fileId) {
    api.documents.open(fileId);
  }

  async function removeAttachedFile(fileId) {
    setRemoving(fileId);
    try {
      await api.documents.delete(fileId);
      if (onFileRemoved) onFileRemoved(fileId);
      const remaining = itemFiles.filter(f => f.id !== fileId);
      await onChange({ fileNote: remaining.length ? remaining[remaining.length - 1].name : '' });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className={`group pl-3 pr-4 py-2 border-l-4 ${edge} ${it.status === 'NA' ? 'opacity-40' : ''} ${selected ? 'bg-fog/60' : ''} transition-colors`}>
      <div className="flex items-center gap-3">
        {selectMode && <input type="checkbox" checked={!!selected} onChange={onToggleSel} title="Select this task" className="shrink-0 accent-green" />}
        <span className="font-mono text-[11px] text-slate-400 w-11 shrink-0">{it.ref !== '•' && it.ref !== '+' ? it.ref : ''}</span>
        {/* File status indicator */}
        <span
          className="w-5 shrink-0 flex items-center justify-center gap-0.5"
          title={hasFiles ? `${fileCount} file${fileCount > 1 ? 's' : ''} attached` : isDone ? 'Completed with no file on record' : it.requestable ? 'Client sends this' : 'Team does this'}
        >
          {hasFiles ? (
            <>
              <span className="text-green">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              {fileCount > 1 && (
                <span className="text-[9px] font-semibold text-green leading-none tabular-nums">{fileCount}</span>
              )}
            </>
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
        {canEdit
          ? <OwnerSelect value={it.owner} team={team} onChange={(v) => onChange({ owner: v })} />
          : it.owner
            ? <span className="text-[10px] text-slate-500 bg-fog px-2 py-0.5 rounded shrink-0 max-w-[6rem] truncate" title={it.owner}>{it.owner.split(' ')[0]}</span>
            : null}
        {canEdit ? <StatusSelect it={it} onChange={(v) => onChange(withStatus(it, v))} /> : (
          <span className={`text-[11px] rounded-full border px-2.5 py-0.5 shrink-0 ${statusStyle(it)}`}>{statusLabel(it)}</span>
        )}
        <button onClick={() => setOpen(!open)} title="Details" className="text-slate-300 hover:text-slate-600 w-5 shrink-0 text-center">{open ? '▾' : '⋯'}</button>
      </div>

      {open && (
        <div className="mt-2 pb-1 space-y-3" style={{ paddingLeft: '3.75rem' }}>

          {/* ── Files or text values ──────────────────────────────── */}
          {isTextType ? (
            <div className="space-y-1.5">
              {textVals.map((v, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  {canEdit ? (
                    <input
                      type={kind === 'number' ? 'text' : 'text'}
                      inputMode={kind === 'number' ? 'decimal' : 'text'}
                      value={v}
                      onChange={(e) => { const n = [...textVals]; n[idx] = e.target.value; setTextVals(n); }}
                      onBlur={() => saveTextVals(textVals)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      placeholder={kind === 'number' ? 'Enter value…' : 'Enter information…'}
                      className="flex-1 border border-tint rounded px-2.5 py-1.5 text-xs text-ink bg-paper focus:outline-none focus:border-green placeholder-slate-300"
                    />
                  ) : (
                    <div className="flex-1 px-2.5 py-1.5 text-xs text-ink bg-fog rounded border border-tint">{v || '—'}</div>
                  )}
                  {canEdit && textVals.length > 1 && (
                    <button
                      onClick={() => { const n = textVals.filter((_, i) => i !== idx); setTextVals(n); saveTextVals(n); }}
                      className="text-slate-300 hover:text-deep text-xs w-5 shrink-0"
                      title="Remove this entry"
                    >✕</button>
                  )}
                </div>
              ))}
              {canEdit && (
                <button
                  onClick={() => setTextVals([...textVals, ''])}
                  className="text-xs text-green hover:underline underline-offset-2"
                >+ Add another value</button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {itemFiles.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  canEdit={canEdit}
                  downloading={downloading === f.id}
                  removing={removing === f.id}
                  onOpen={() => openFile(f.id)}
                  onRemove={() => removeAttachedFile(f.id)}
                  onNoteChange={(note) => {
                    if (onFileUploaded) onFileUploaded({ ...f, note });
                    if (onFileRemoved) onFileRemoved(f.id);
                  }}
                />
              ))}
              {canEdit && (
                <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-dashed text-xs cursor-pointer transition-colors ${uploading ? 'border-tint text-slate-400 cursor-wait' : 'border-tint text-slate-400 hover:border-green hover:text-green'}`}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  {uploading ? 'Uploading…' : fileCount > 0 ? 'Add another file' : 'Upload a file'}
                  <input ref={fileInputRef} type="file" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
                </label>
              )}
              {fileCount === 0 && !canEdit && <div className="text-xs text-slate-400">No files attached</div>}
            </div>
          )}

          {/* ── Task-level fields ─────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-slate-500">
              Remarks
              {canEdit
                ? <EditableText value={it.remarks || ''} onSave={(v) => onChange({ remarks: v })} placeholder="overall task remark…" className="w-full mt-0.5 text-xs" />
                : <div className="mt-0.5 text-xs text-ink">{it.remarks || '—'}</div>}
            </label>
            <div className="text-xs text-slate-500">
              Who provides this
              <div className="mt-1 flex rounded border border-tint overflow-hidden text-[11px] w-fit">
                <button
                  disabled={!canEdit}
                  onClick={() => canEdit && onChange({ requestable: true })}
                  className={`px-3 py-1 transition-colors ${it.requestable ? 'bg-green text-paper font-medium' : 'text-slate-500 hover:bg-fog disabled:cursor-default'}`}
                >Client</button>
                <button
                  disabled={!canEdit}
                  onClick={() => canEdit && onChange({ requestable: false })}
                  className={`px-3 py-1 border-l border-tint transition-colors ${!it.requestable ? 'bg-deep text-paper font-medium' : 'text-slate-500 hover:bg-fog disabled:cursor-default'}`}
                >Team</button>
              </div>
            </div>
            <div className="text-xs text-slate-500">
              {canEdit ? (
                <>
                  Type
                  <div className="text-[10px] text-slate-400 mb-1">Override for this engagement</div>
                  <select
                    value={kind}
                    onChange={(e) => onChange({ kind: e.target.value })}
                    className="text-xs border border-tint rounded px-2 py-1 bg-paper focus:outline-none focus:border-green"
                  >
                    <option value="document">Document</option>
                    <option value="number">Number</option>
                    <option value="information">Information</option>
                  </select>
                </>
              ) : (
                <>
                  Type
                  <div className="mt-0.5 text-xs text-ink capitalize">{kind}</div>
                </>
              )}
            </div>
          </div>

          {/* ── Dates ─────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
            <label className="flex items-center gap-2">
              Received on
              <input type="date" value={it.dateReceived || ''} max={today()} disabled={!canEdit} onChange={(e) => onChange({ dateReceived: e.target.value })} className="border border-tint rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-green disabled:opacity-60" />
            </label>
            <label className="flex items-center gap-2">
              Due
              <input type="date" value={it.due || ''} disabled={!canEdit} onChange={(e) => onChange({ due: e.target.value })} className="border border-tint rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-green disabled:opacity-60" />
            </label>
          </div>

          {/* ── Meta + delete ─────────────────────────────────────── */}
          <div className="flex items-center gap-4 text-xs text-slate-400">
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

function ScopePanel({ orderedHeads, setHeadIncluded, onClose, updateItem, engagementId, onReload }) {
  const toast = useToast();

  const bySection = {};
  for (const h of orderedHeads) (bySection[h.section] = bySection[h.section] || []).push(h);

  const [collSections, setCollSections] = useState(() => {
    const s = {};
    for (const sec of Object.keys(bySection)) s[sec] = true;
    return s;
  });
  const [openHead, setOpenHead] = useState(null);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingSubInSection, setAddingSubInSection] = useState(null);
  const [newSubName, setNewSubName] = useState('');
  const [addingTaskInHead, setAddingTaskInHead] = useState(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskReq, setNewTaskReq] = useState(false);

  const included = orderedHeads.filter((h) => h.items[0]?.headIncluded);
  const totals = included.reduce((acc, h) => {
    h.items.forEach((it) => { if (it.status !== 'NA') (it.requestable ? acc.client++ : acc.team++); });
    return acc;
  }, { client: 0, team: 0 });

  async function doAddTask(head) {
    if (!newTaskText.trim()) return;
    try {
      await api.items.addAdhoc({ engagementId, p: newTaskText.trim(), section: head.section, sub: head.sub, headId: head.headId, requestable: newTaskReq });
      setAddingTaskInHead(null); setNewTaskText(''); setNewTaskReq(false);
      if (onReload) onReload();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function doAddSub(section) {
    if (!newSubName.trim()) return;
    const headId = `custom_${section}_${Date.now()}`;
    try {
      await api.items.addAdhoc({ engagementId, p: 'New task', section, sub: newSubName.trim(), headId, requestable: false });
      setAddingSubInSection(null); setNewSubName('');
      if (onReload) onReload();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function doAddCategory() {
    if (!newCatName.trim()) return;
    const used = new Set(Object.keys(bySection));
    const sec = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('').find(l => !used.has(l)) || `X${Date.now()}`;
    const headId = `custom_cat_${Date.now()}`;
    try {
      await api.items.addAdhoc({ engagementId, p: 'New task', section: sec, sub: newCatName.trim(), headId, requestable: false });
      setAddingCategory(false); setNewCatName('');
      if (onReload) onReload();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <Modal title="Scope — which areas apply to this client" onClose={onClose} wide>
      {/* Summary totals */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="text-xs text-slate-500 max-w-md leading-relaxed">
          Toggle sub-categories in or out of scope. Expand any sub-category to mark each task as{' '}
          <span className="font-medium text-green">Client</span> (WhatsApp request) or{' '}
          <span className="font-medium text-deep">Team work</span> (internal).
        </p>
        <div className="flex items-stretch gap-3 shrink-0">
          <div className="text-right">
            <div className="text-2xl font-semibold text-green tabular-nums leading-none">{totals.client}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">client tasks</div>
          </div>
          <div className="w-px bg-tint self-stretch" />
          <div className="text-right">
            <div className="text-2xl font-semibold text-deep tabular-nums leading-none">{totals.team}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">team tasks</div>
          </div>
        </div>
      </div>

      {/* Library catalogue box */}
      <div className="mb-4 rounded-lg border border-tint bg-fog/40 overflow-hidden">
        <button
          onClick={() => setCatalogueOpen(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-fog/60 transition-colors"
        >
          <span className={`text-slate-400 text-[10px] transition-transform duration-150 ${catalogueOpen ? '' : '-rotate-90'}`}>▾</span>
          <span className="text-xs font-medium text-slate-600">Browse library catalogue</span>
          <span className="text-[10px] text-slate-400 ml-1 bg-tint px-1.5 py-0.5 rounded-full">
            {orderedHeads.filter(h => !h.items[0]?.headIncluded).length} available
          </span>
        </button>
        {catalogueOpen && (
          <div className="border-t border-tint px-3 pb-3 pt-2.5 space-y-3">
            <p className="text-[10px] text-slate-400">Click an area to add it to scope. Already-included areas are shown greyed out.</p>
            {Object.entries(bySection).map(([sec, hs]) => (
              <div key={sec}>
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">{sectionLabel(sec)}</div>
                <div className="flex flex-wrap gap-1.5">
                  {hs.map((h) => {
                    const on = h.items[0]?.headIncluded;
                    return (
                      <button
                        key={h.headId}
                        disabled={on}
                        onClick={() => !on && setHeadIncluded(h.headId, true)}
                        className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                          on
                            ? 'border-tint text-slate-400 opacity-50 cursor-default'
                            : 'border-tint text-ink hover:border-green hover:text-green cursor-pointer'
                        }`}
                      >
                        {on && <span className="text-green text-[9px]">✓</span>}
                        {h.sub}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scope configuration — sections */}
      <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
        {Object.entries(bySection).map(([sec, hs]) => {
          const includedHs = hs.filter(h => h.items[0]?.headIncluded);
          const secClient = includedHs.reduce((n, h) => n + h.items.filter(i => i.requestable && i.status !== 'NA').length, 0);
          const secTeam = includedHs.reduce((n, h) => n + h.items.filter(i => !i.requestable && i.status !== 'NA').length, 0);
          const isCollapsed = collSections[sec];

          return (
            <div key={sec} className="rounded-lg border border-tint overflow-hidden">
              {/* Section header — click to expand/collapse */}
              <button
                onClick={() => setCollSections(p => ({ ...p, [sec]: !p[sec] }))}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-fog/60 hover:bg-fog transition-colors text-left"
              >
                <span className={`text-slate-400 text-[10px] shrink-0 transition-transform duration-150 ${isCollapsed ? '-rotate-90' : ''}`}>▾</span>
                <span className="text-sm font-medium text-ink flex-1">{sectionLabel(sec)}</span>
                <span className="text-[11px] tabular-nums shrink-0">
                  <span className="text-green">{secClient}</span>
                  <span className="text-slate-400"> client · </span>
                  <span className="text-deep">{secTeam}</span>
                  <span className="text-slate-400"> team</span>
                </span>
                <span className="text-[10px] text-slate-400 shrink-0 ml-2">{includedHs.length}/{hs.length} in scope</span>
              </button>

              {/* Sub-categories */}
              {!isCollapsed && (
                <div className="divide-y divide-tint/40">
                  {hs.map((h) => {
                    const on = h.items[0]?.headIncluded;
                    const cliCount = h.items.filter(i => i.requestable && i.status !== 'NA').length;
                    const teamCount = h.items.filter(i => !i.requestable && i.status !== 'NA').length;
                    const isOpen = openHead === h.headId;
                    const isAddingTask = addingTaskInHead === h.headId;

                    return (
                      <div key={h.headId}>
                        <div className={`flex items-center gap-2 px-3 py-2 ${!on ? 'opacity-50' : ''}`}>
                          {/* In-scope toggle */}
                          <button
                            onClick={() => setHeadIncluded(h.headId, !on)}
                            className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 transition-colors ${on ? 'bg-green text-paper' : 'border border-tint bg-paper text-transparent'}`}
                            title={on ? 'Remove from scope' : 'Add to scope'}
                          >✓</button>

                          {/* Name */}
                          <span className="flex-1 text-sm text-ink min-w-0 truncate">{h.sub}</span>

                          {/* Client / Team chips */}
                          {on && (
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green/10 text-green font-medium tabular-nums">{cliCount} client</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-deep/10 text-deep font-medium tabular-nums">{teamCount} team</span>
                            </div>
                          )}

                          {/* Tasks dropdown trigger */}
                          <button
                            onClick={() => setOpenHead(isOpen ? null : h.headId)}
                            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-ink px-2 py-1 rounded hover:bg-fog transition-colors shrink-0"
                            aria-expanded={isOpen}
                          >
                            {h.items.length} tasks
                            <span className={`text-[9px] transition-transform duration-150 ${isOpen ? '' : '-rotate-90'}`}>▾</span>
                          </button>
                        </div>

                        {/* Expanded tasks panel */}
                        {isOpen && (
                          <div className="border-t border-tint/40 bg-fog/20">
                            <div className="divide-y divide-tint/30">
                              {h.items.map((it) => (
                                <div key={it.id} className="px-4 py-1.5 flex items-center gap-3">
                                  <span className="font-mono text-[10px] text-slate-400 w-10 shrink-0">{it.ref !== '•' && it.ref !== '+' ? it.ref : ''}</span>
                                  <span className={`flex-1 text-xs min-w-0 ${it.status === 'NA' ? 'line-through text-slate-400' : 'text-ink'}`}>{it.p}</span>
                                  <div className="flex rounded border border-tint overflow-hidden text-[10px] shrink-0" role="group" aria-label="Task assignee">
                                    <button
                                      onClick={() => updateItem(it.id, { requestable: true })}
                                      className={`px-2.5 py-1 transition-colors ${it.requestable ? 'bg-green text-paper font-medium' : 'text-slate-500 hover:bg-fog'}`}
                                    >Client</button>
                                    <button
                                      onClick={() => updateItem(it.id, { requestable: false })}
                                      className={`px-2.5 py-1 border-l border-tint transition-colors ${!it.requestable ? 'bg-deep text-paper font-medium' : 'text-slate-500 hover:bg-fog'}`}
                                    >Team work</button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Add task row */}
                            {isAddingTask ? (
                              <div className="px-3 py-2 flex items-center gap-2 border-t border-tint/40 bg-paper/60">
                                <input
                                  autoFocus
                                  value={newTaskText}
                                  onChange={e => setNewTaskText(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') doAddTask(h); if (e.key === 'Escape') { setAddingTaskInHead(null); setNewTaskText(''); } }}
                                  placeholder="Task description…"
                                  className="flex-1 border border-tint rounded px-2 py-1 text-xs focus:outline-none focus:border-green"
                                />
                                <div className="flex rounded border border-tint overflow-hidden text-[10px] shrink-0">
                                  <button onClick={() => setNewTaskReq(true)} className={`px-2 py-1 transition-colors ${newTaskReq ? 'bg-green text-paper font-medium' : 'text-slate-500 hover:bg-fog'}`}>Client</button>
                                  <button onClick={() => setNewTaskReq(false)} className={`px-2 py-1 border-l border-tint transition-colors ${!newTaskReq ? 'bg-deep text-paper font-medium' : 'text-slate-500 hover:bg-fog'}`}>Team</button>
                                </div>
                                <Btn size="sm" onClick={() => doAddTask(h)}>Add</Btn>
                                <Btn size="sm" kind="ghost" onClick={() => { setAddingTaskInHead(null); setNewTaskText(''); }}>Cancel</Btn>
                              </div>
                            ) : (
                              <button
                                onClick={() => setAddingTaskInHead(h.headId)}
                                className="w-full px-4 py-1.5 text-[11px] text-slate-400 hover:text-green hover:bg-fog/60 text-left border-t border-tint/40 transition-colors"
                              >+ Add task</button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add sub-category */}
                  {addingSubInSection === sec ? (
                    <div className="px-3 py-2 flex items-center gap-2 bg-fog/40">
                      <input
                        autoFocus
                        value={newSubName}
                        onChange={e => setNewSubName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') doAddSub(sec); if (e.key === 'Escape') { setAddingSubInSection(null); setNewSubName(''); } }}
                        placeholder="Sub-category name…"
                        className="flex-1 border border-tint rounded px-2 py-1 text-xs focus:outline-none focus:border-green"
                      />
                      <Btn size="sm" onClick={() => doAddSub(sec)}>Add</Btn>
                      <Btn size="sm" kind="ghost" onClick={() => { setAddingSubInSection(null); setNewSubName(''); }}>Cancel</Btn>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingSubInSection(sec)}
                      className="w-full px-3 py-2 text-xs text-slate-400 hover:text-green hover:bg-fog/40 text-left transition-colors"
                    >+ Add sub-category</button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add overall category */}
        <div className="pt-1">
          {addingCategory ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-tint bg-fog/20">
              <input
                autoFocus
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') doAddCategory(); if (e.key === 'Escape') { setAddingCategory(false); setNewCatName(''); } }}
                placeholder="Category name…"
                className="flex-1 border border-tint rounded px-2 py-1 text-xs focus:outline-none focus:border-green"
              />
              <Btn size="sm" onClick={doAddCategory}>Add</Btn>
              <Btn size="sm" kind="ghost" onClick={() => { setAddingCategory(false); setNewCatName(''); }}>Cancel</Btn>
            </div>
          ) : (
            <button
              onClick={() => setAddingCategory(true)}
              className="w-full text-xs text-slate-400 hover:text-green py-2 text-left transition-colors"
            >+ Add category</button>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-4 mt-2 border-t border-tint">
        <Btn onClick={onClose}>Done</Btn>
      </div>
    </Modal>
  );
}

function ComposeModal({ compose, setCompose, phone, waGroupId, engagementId, onConfirm, onGroupSent }) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  async function copy() {
    try { await navigator.clipboard.writeText(compose.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  async function sendToGroup() {
    setSending(true);
    try {
      const itemIds = compose.items.map((it) => it.id);
      await api.engagements.sendWhatsapp(engagementId, { itemIds, messageText: compose.text });
      setSent(true);
      setTimeout(() => onGroupSent(), 1500);
    } catch (err) {
      toast(err.message || 'Failed to send to WhatsApp group. Please try again.', 'error');
    } finally {
      setSending(false);
    }
  }

  const parts = [
    compose.fresh.length && `${compose.fresh.length} new request${compose.fresh.length > 1 ? 's' : ''}`,
    compose.awaited.length && `${compose.awaited.length} reminder${compose.awaited.length > 1 ? 's' : ''}`,
    compose.resend.length && `${compose.resend.length} resend${compose.resend.length > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ');

  const groupLabel = waGroupId
    ? (waGroupId.length > 20 ? waGroupId.slice(0, 20) + '…' : waGroupId)
    : null;

  return (
    <Modal title="Message client" onClose={() => setCompose(null)} wide>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-ink">{parts || 'No items to send'}</p>
          {compose.skipped > 0 && (
            <p className="text-xs text-slate-400 mt-0.5">
              {compose.skipped} ticked item{compose.skipped > 1 ? 's' : ''} left out — received, complete, N/A or team work.
            </p>
          )}
        </div>
        <div className="text-right ml-4 shrink-0">
          {groupLabel
            ? <p className="text-xs text-slate-500">Sending to group <span className="font-mono text-ink">{groupLabel}</span></p>
            : phone
              ? <p className="text-xs text-slate-500">To <span className="font-mono text-ink">+{phone}</span></p>
              : <p className="text-xs text-slate-400">No group or phone linked</p>
          }
          <p className="text-xs text-slate-400 mt-0.5">Edit the message below before sending.</p>
        </div>
      </div>
      <textarea value={compose.text} onChange={(e) => setCompose({ ...compose, text: e.target.value })} className="w-full h-64 border border-tint rounded-lg p-3 text-sm font-mono text-ink bg-fog focus:outline-none resize-none" />

      {sent ? (
        <div className="flex items-center justify-center gap-2 mt-4 py-3 px-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          Message sent to group — tasks moved to Awaited
        </div>
      ) : (
        <div className="flex items-center justify-between pt-4">
          <Btn kind="ghost" onClick={copy}>{copied ? 'Copied ✓' : 'Copy text'}</Btn>
          <div className="flex gap-2">
            <Btn kind="ghost" onClick={() => setCompose(null)}>Cancel</Btn>
            <Btn kind="ghost" onClick={() => onConfirm(false)} title="Record this as sent without opening WhatsApp">Mark as sent</Btn>
            <Btn kind="ghost" onClick={() => onConfirm(true)} disabled={!phone}>Open WhatsApp</Btn>
            <Btn
              onClick={sendToGroup}
              disabled={!waGroupId || sending}
              title={waGroupId ? 'Send directly to the linked WhatsApp group' : 'No WA group linked to this engagement'}
            >
              {sending ? 'Sending…' : 'Send to group'}
            </Btn>
          </div>
        </div>
      )}
      {!waGroupId && !sent && <p className="text-xs text-deep mt-2 text-right">No WA group linked — add a group ID on this engagement to send directly.</p>}
    </Modal>
  );
}

function FilesModal({ engagementId, files, heads, onClose, onAdd, onMatch, onUnmatch, onRemove, canDelete, onMarkIrrelevant }) {
  const unmatched = files.filter((f) => !f.assignedItemId && f.status !== 'Irrelevant');
  const matched = files.filter((f) => f.assignedItemId);
  const irrelevant = files.filter((f) => f.status === 'Irrelevant');
  const [cur, setCur] = useState(unmatched[0]?.id || null);
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);
  const [collapsedMatchedHeads, setCollapsedMatchedHeads] = useState({});
  const unmatchedKey = unmatched.map((f) => f.id).join(',');
  useEffect(() => { if (!unmatched.some((f) => f.id === cur)) setCur(unmatched[0]?.id || null); }, [unmatchedKey]);

  const itemById = {};
  for (const h of heads) for (const it of h.items) itemById[it.id] = it;
  const ql = q.trim().toLowerCase();
  const targets = heads.flatMap((h) => h.items.filter((it) => it.status !== 'NA' && (!ql || it.p.toLowerCase().includes(ql) || h.sub.toLowerCase().includes(ql))).map((it) => ({ it, h })));
  const curFile = unmatched.find((f) => f.id === cur);

  // Group matched files by their head (section/sub-category)
  const matchedGroups = (() => {
    const groups = {};
    for (const f of matched) {
      const it = itemById[f.assignedItemId];
      if (!it) continue;
      const h = heads.find(hd => hd.items.some(i => i.id === f.assignedItemId));
      if (!h) continue;
      if (!groups[h.headId]) groups[h.headId] = { head: h, entries: [] };
      groups[h.headId].entries.push({ file: f, item: it });
    }
    return Object.values(groups);
  })();

  function openFile(f) {
    api.documents.open(f.id);
  }

  async function handleAdd(fileList) {
    setUploading(true);
    try { await onAdd(fileList); } finally { setUploading(false); }
  }

  return (
    <Modal title="Documents" onClose={onClose} wide>
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-xs text-slate-600 max-w-lg">Everything the client sends lands here. Pick a file on the left, then the task it belongs to on the right; the task moves to <span className="font-medium text-ink">To review</span>.</p>
        <label className="cursor-pointer shrink-0">
          <span className="inline-block text-sm px-4 py-2 rounded-md bg-green text-paper hover:bg-deep">{uploading ? 'Uploading…' : 'Add files'}</span>
          <input type="file" multiple className="hidden" disabled={uploading} onChange={(e) => { if (e.target.files?.length) handleAdd(e.target.files); e.target.value = ''; }} />
        </label>
      </div>

      {/* Unmatched + task matcher */}
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
              {onMarkIrrelevant && <button onClick={() => onMarkIrrelevant(curFile.id, true)} className="text-slate-400 hover:text-slate-600">Not relevant</button>}
              {canDelete && <button onClick={() => { if (confirm('Delete this file?')) onRemove(curFile.id); }} className="text-slate-400 hover:text-deep">Delete</button>}
            </div>
          )}
          {irrelevant.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] text-slate-400 mb-1">Not relevant ({irrelevant.length})</div>
              <div className="space-y-0.5">
                {irrelevant.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-xs text-slate-400 px-1">
                    <span className="truncate flex-1 line-through" title={f.name}>{f.name}</span>
                    {onMarkIrrelevant && <button onClick={() => onMarkIrrelevant(f.id, false)} className="text-green hover:underline shrink-0 text-[10px]">Restore</button>}
                  </div>
                ))}
              </div>
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

      {/* Matched files — grouped by section/sub, collapsed by default */}
      {matched.length > 0 && (
        <div className="mt-5 border-t border-tint pt-4">
          <div className="text-xs font-medium text-slate-600 mb-2">
            Matched documents <span className="font-mono text-slate-400">{matched.length}</span>
          </div>
          <div className="space-y-1">
            {matchedGroups.map(({ head, entries }) => {
              const isCollapsed = collapsedMatchedHeads[head.headId] !== false;
              return (
                <div key={head.headId} className="border border-tint rounded-lg overflow-hidden">
                  <button
                    onClick={() => setCollapsedMatchedHeads(p => ({ ...p, [head.headId]: !isCollapsed }))}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-fog/40 hover:bg-fog text-left transition-colors"
                  >
                    <span className={`text-[10px] text-slate-400 transition-transform duration-150 ${isCollapsed ? '-rotate-90' : ''}`}>▾</span>
                    <span className="text-xs font-medium text-ink flex-1 min-w-0 truncate">{head.sub}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{entries.length} file{entries.length !== 1 ? 's' : ''}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="divide-y divide-tint/60 border-t border-tint">
                      {entries.map(({ file: f, item: it }) => (
                        <div key={f.id} className="px-3 py-2 flex items-center gap-3">
                          <button onClick={() => openFile(f)} className="text-sm text-ink hover:text-green hover:underline underline-offset-2 truncate flex-1 text-left min-w-0" title={f.name}>{f.name}</button>
                          <span className="text-xs text-slate-400 truncate max-w-[180px] shrink-0" title={it.p}>{it.p}</span>
                          <button onClick={() => onUnmatch(f.id)} className="text-xs text-slate-400 hover:text-ink shrink-0">Unmatch</button>
                          {canDelete && <button onClick={() => { if (confirm('Delete this file?')) onRemove(f.id); }} className="text-xs text-slate-400 hover:text-deep shrink-0">Delete</button>}
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
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'client' | 'team'
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

  async function commitIncharge(name) {
    const prevIncharge = engagement?.incharge || '';
    await commitEng({ incharge: name });
    if (name) {
      // Reassign tasks that belong to the previous in-charge or have no owner
      const toReassign = items.filter(it => !it.owner || it.owner === prevIncharge);
      if (toReassign.length > 0) {
        setItems(prev => prev.map(it => (!it.owner || it.owner === prevIncharge) ? { ...it, owner: name } : it));
        try {
          await api.items.bulkUpdate(toReassign.map(it => ({ id: it.id, owner: name })));
          toast(`Assigned ${toReassign.length} task${toReassign.length !== 1 ? 's' : ''} to ${name}`, 'success');
        } catch (err) { toast(err.message, 'error'); load(); }
      }
    }
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
    .map((h) => ({ ...h, items: h.items.filter((it) =>
      (stageFilter === 'na' ? it.status === 'NA' : (!stageFilter || stageOf(it) === stageFilter)) &&
      (!ql || it.p.toLowerCase().includes(ql) || (it.ref || '').toLowerCase().includes(ql) || (it.owner || '').toLowerCase().includes(ql)) &&
      (typeFilter === 'all' || (typeFilter === 'client' ? it.requestable : !it.requestable))
    ) }))
    .filter((h) => h.items.length > 0 || (h.headId === 'adhoc' && !stageFilter && !ql && typeFilter === 'all'));

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
                <select value={engagement.incharge || ''} disabled={!isPartnerManager} onChange={(e) => commitIncharge(e.target.value)} className={`text-xs rounded-full border px-2 py-0.5 bg-paper focus:outline-none focus:border-green ${engagement.incharge ? 'text-ink border-tint' : 'text-slate-400 border-green'}`}>
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

      {/* Document repository strip — visible to all */}
      <button
        onClick={() => setFilesOpen(true)}
        className="w-full mb-4 flex items-center gap-3 px-4 py-2.5 rounded-lg border border-tint bg-fog/30 hover:border-green hover:bg-fog/50 transition-colors group text-left"
      >
        <svg className="text-slate-400 group-hover:text-green shrink-0 transition-colors" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span className="text-sm font-medium text-ink">Documents</span>
        {files.length > 0 && <span className="text-xs text-slate-500">{files.filter(f => f.assignedItemId).length > 0 || files.some(f => !f.assignedItemId && f.status !== 'Irrelevant') ? `${files.filter(f => f.status !== 'Irrelevant').length} file${files.filter(f => f.status !== 'Irrelevant').length !== 1 ? 's' : ''} received` : ''}</span>}
        {files.filter(f => !f.assignedItemId && f.status !== 'Irrelevant').length > 0 && (
          <span className="text-xs text-deep font-medium">· {files.filter(f => !f.assignedItemId && f.status !== 'Irrelevant').length} unmatched</span>
        )}
        <span className="flex-1" />
        <span className="text-xs text-slate-400 group-hover:text-green transition-colors">Open →</span>
      </button>

      {canEdit && (
        <div className="sticky top-0 z-20 -mx-8 px-8 pt-2.5 pb-2 mb-4 bg-paper border-b border-tint">
          <div className="flex flex-wrap items-center gap-2">

            {/* Client messaging workflow group */}
            {selecting ? (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-stretch rounded-lg border border-tint overflow-hidden text-xs">
                  <button onClick={stopSelect} className="px-3 py-1.5 text-slate-500 hover:bg-fog border-r border-tint transition-colors">Cancel</button>
                  <button
                    onClick={openCompose}
                    disabled={messageable === 0}
                    className={`px-3 py-1.5 font-medium transition-colors ${messageable > 0 ? 'bg-green text-paper hover:bg-deep' : 'text-slate-400 cursor-not-allowed bg-fog/40'}`}
                  >
                    Message{messageable > 0 ? <span className="ml-1.5 font-normal opacity-80 tabular-nums">{messageable}</span> : null}
                  </button>
                </div>
                <span className="text-[10px] text-slate-400">Select:</span>
                <button onClick={() => startSelect(owedToUs)} className="text-xs text-green hover:underline underline-offset-2">Everything owed</button>
                <button onClick={() => startSelect((it) => it.headIncluded && it.requestable && it.status === 'No progress')} className="text-xs text-slate-500 hover:underline underline-offset-2">Not yet requested</button>
                <button onClick={() => startSelect((it) => owedToUs(it) && it.status === 'Requested')} className="text-xs text-slate-500 hover:underline underline-offset-2">Awaited</button>
                <button onClick={() => setSel({})} className="text-xs text-slate-400 hover:underline underline-offset-2">Clear</button>
              </div>
            ) : (
              <div className="flex items-stretch rounded-lg border border-tint overflow-hidden text-xs">
                <button onClick={() => startSelect(null)} className="px-3 py-1.5 text-slate-600 hover:bg-fog border-r border-tint transition-colors">
                  Select tasks
                </button>
                <button
                  onClick={() => startSelect(owedToUs)}
                  disabled={owed === 0}
                  className={`px-3 py-1.5 font-medium transition-colors ${owed > 0 ? 'text-ink hover:bg-fog' : 'text-slate-400 cursor-not-allowed'}`}
                >
                  Message client{owed > 0 ? <span className="ml-1.5 text-[10px] font-normal text-slate-400 tabular-nums">{owed} pending</span> : null}
                </button>
              </div>
            )}

            {/* Scope */}
            {libraryHeads.length > 0 && (
              <button onClick={() => setScoping(true)} className="px-3 py-1.5 text-xs text-slate-600 border border-tint rounded-lg hover:bg-fog transition-colors">
                Scope
              </button>
            )}

            <div className="flex-1" />

            {/* Type filter */}
            <div className="flex items-stretch rounded-lg border border-tint overflow-hidden text-xs">
              {[['all', 'All'], ['client', 'Client'], ['team', 'Team']].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setTypeFilter(v)}
                  className={`px-2.5 py-1.5 transition-colors border-r border-tint last:border-r-0 ${typeFilter === v ? 'bg-green text-paper font-medium' : 'text-slate-500 hover:bg-fog'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a task"
              aria-label="Find a task in this ledger"
              className="text-sm border border-tint rounded-lg px-3 py-1.5 bg-paper w-44 focus:outline-none focus:border-green"
            />

            {/* Collapse all */}
            {scopedIn.length > 1 && (
              <button
                onClick={() => { const all = scopedIn.every((h) => collapsed[h.headId]); const nxt = {}; scopedIn.forEach((h) => (nxt[h.headId] = !all)); setCollapsed(nxt); }}
                className="text-xs text-slate-400 hover:text-ink"
              >
                {scopedIn.every((h) => collapsed[h.headId]) ? 'Expand all' : 'Collapse all'}
              </button>
            )}
          </div>

          {/* Next step hint + filter controls */}
          <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
            {nextStep.action && isPartnerManager
              ? <button onClick={() => doNext(nextStep.action)} className="hover:text-green hover:underline underline-offset-2">{nextStep.text}</button>
              : <span>{nextStep.text}</span>}
            {(stageFilter || typeFilter !== 'all') && (
              <button onClick={() => { setStageFilter(null); setTypeFilter('all'); }} className="text-green hover:underline underline-offset-2">Clear filters</button>
            )}
            {naCount > 0 && stageFilter !== 'na' && (
              <button onClick={() => setStageFilter('na')} className="hover:text-ink">{naCount} N/A</button>
            )}
          </div>
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
                      itemFiles={files.filter(f => f.assignedItemId === it.id)}
                      onFileUploaded={(file) => setFiles(prev => [...prev, file])}
                      onFileRemoved={(fileId) => setFiles(prev => prev.filter(f => f.id !== fileId))}
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


      {scoping && <ScopePanel orderedHeads={libraryHeads} setHeadIncluded={setHeadIncluded} updateItem={updateItem} onClose={() => setScoping(false)} engagementId={id} onReload={load} />}
      {compose && (
        <ComposeModal
          compose={compose}
          setCompose={setCompose}
          phone={phone}
          waGroupId={engagement?.waGroupId || ''}
          engagementId={id}
          onConfirm={confirmSend}
          onGroupSent={() => { setCompose(null); stopSelect(); load(); }}
        />
      )}
      {filesOpen && (
        <FilesModal
          engagementId={id} files={files} heads={includedHeads} onClose={() => setFilesOpen(false)}
          onAdd={addFiles} onMatch={matchFile} onUnmatch={unmatchFile} onRemove={removeFile} canDelete={canDeleteFiles}
          onMarkIrrelevant={async (fileId, isIrrelevant) => {
            try { await api.inbox.markIrrelevant(fileId, isIrrelevant); load(); }
            catch (err) { toast(err.message, 'error'); }
          }}
        />
      )}
    </div>
  );
}
