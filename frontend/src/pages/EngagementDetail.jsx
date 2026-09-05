import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Btn from '../components/Btn.jsx';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';

const STATUSES = ['No progress', 'In progress', 'Completed', 'N/A'];

function statusStyle(s) {
  if (s === 'Completed') return 'bg-fog text-green border-green/40';
  if (s === 'In progress') return 'bg-fog text-deep border-tint';
  if (s === 'N/A') return 'bg-fog text-slate-400 border-tint';
  return 'bg-paper text-slate-400 border-tint';
}

// ---- Item row ----
function ItemRow({ item, onUpdate, canEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ status: item.status, remarks: item.remarks || '', dueDate: item.dueDate || '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function saveItem() {
    setSaving(true);
    try {
      await onUpdate(item.id, draft);
      setEditing(false);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status) {
    try {
      await onUpdate(item.id, { ...draft, status });
      setDraft(d => ({ ...d, status }));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className={`border-b border-tint last:border-0 ${item.status === 'Completed' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-fog/50 transition-colors">
        {/* Status pill */}
        <div className="shrink-0 pt-0.5">
          {canEdit ? (
            <select
              value={draft.status}
              onChange={e => changeStatus(e.target.value)}
              className={`text-[11px] rounded-full border pl-2.5 pr-6 py-0.5 focus:outline-none cursor-pointer appearance-none ${statusStyle(draft.status)}`}
              style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%231C1C1C' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <span className={`text-[11px] rounded-full border px-2.5 py-0.5 ${statusStyle(draft.status)}`}>{draft.status}</span>
          )}
        </div>

        {/* Description */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink leading-snug">{item.description}</p>
          {item.remarks && !editing && (
            <p className="text-xs text-slate-500 mt-0.5 italic">"{item.remarks}"</p>
          )}
          {editing && (
            <div className="mt-2 space-y-2">
              <textarea
                value={draft.remarks}
                onChange={e => setDraft(d => ({ ...d, remarks: e.target.value }))}
                placeholder="Add a remark…"
                rows={2}
                className="w-full border border-tint rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green resize-none"
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500">Due:</label>
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={e => setDraft(d => ({ ...d, dueDate: e.target.value }))}
                  className="border border-tint rounded-md px-2 py-1 text-xs focus:outline-none focus:border-green"
                />
                <div className="flex gap-1 ml-auto">
                  <Btn size="sm" kind="ghost" onClick={() => setEditing(false)}>Cancel</Btn>
                  <Btn size="sm" onClick={saveItem} disabled={saving}>{saving ? '…' : 'Save'}</Btn>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {canEdit && !editing && (
          <div className="shrink-0 flex items-center gap-2">
            {item.dueDate && (
              <span className="text-[11px] font-mono text-slate-400">{item.dueDate}</span>
            )}
            <button onClick={() => setEditing(true)} className="text-[11px] text-slate-400 hover:text-ink">Edit</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Inbox tab ----
function InboxTab({ engagementId, items }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    api.inbox.list(engagementId).then(r => setFiles(Array.isArray(r) ? r : [])).catch(() => {}).finally(() => setLoading(false));
  }, [engagementId]);

  async function assign(fileId, itemId) {
    try {
      if (itemId) {
        await api.inbox.assign(fileId, itemId);
        toast('File assigned', 'success');
      } else {
        await api.inbox.unassign(fileId);
        toast('File unassigned', 'success');
      }
      const updated = await api.inbox.list(engagementId);
      setFiles(Array.isArray(updated) ? updated : []);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (loading) return <div className="p-4 text-sm text-slate-400">Loading…</div>;
  if (files.length === 0) return (
    <div className="p-8 text-center">
      <p className="text-sm text-slate-400">No files in inbox for this engagement.</p>
      <p className="text-xs text-slate-400 mt-1">Files arrive automatically via WhatsApp.</p>
    </div>
  );

  const unassigned = files.filter(f => !f.assignedItemId);
  const assigned = files.filter(f => f.assignedItemId);

  return (
    <div>
      {unassigned.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Unassigned ({unassigned.length})</h3>
          <div className="space-y-2">
            {unassigned.map(f => (
              <div key={f.id} className="flex items-center gap-3 bg-paper border border-tint rounded-md px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink truncate">{f.filename}</div>
                  <div className="text-xs text-slate-500">{new Date(f.receivedAt).toLocaleString()}</div>
                </div>
                <select
                  defaultValue=""
                  onChange={e => assign(f.id, e.target.value || null)}
                  className="text-xs border border-tint rounded-md px-2 py-1 focus:outline-none focus:border-green"
                >
                  <option value="">Assign to item…</option>
                  {items.map(it => (
                    <option key={it.id} value={it.id}>{it.description.slice(0, 60)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
      {assigned.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Assigned ({assigned.length})</h3>
          <div className="space-y-2">
            {assigned.map(f => {
              const item = items.find(it => it.id === f.assignedItemId);
              return (
                <div key={f.id} className="flex items-center gap-3 bg-fog border border-tint rounded-md px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink truncate">{f.filename}</div>
                    <div className="text-xs text-slate-500 truncate">→ {item?.description || f.assignedItemId}</div>
                  </div>
                  <button onClick={() => assign(f.id, null)} className="text-xs text-slate-400 hover:text-deep">Unassign</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Documents tab ----
function DocumentsTab({ engagementId, items }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();
  const toast = useToast();

  async function loadDocs() {
    // Documents are fetched per-engagement via items; for now show via upload history
    setLoading(false);
  }

  useEffect(() => { loadDocs(); }, [engagementId]);

  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('engagementId', engagementId);
    try {
      await api.documents.upload(fd);
      toast('File uploaded', 'success');
      fileRef.current.value = '';
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <label className="cursor-pointer">
          <span className="bg-green text-paper rounded-md px-4 py-2 text-sm font-medium hover:bg-deep transition-colors inline-block">
            {uploading ? 'Uploading…' : 'Upload file'}
          </span>
          <input ref={fileRef} type="file" className="sr-only" onChange={upload} disabled={uploading} />
        </label>
        <span className="text-xs text-slate-400">Attach documents to this engagement</span>
      </div>
    </div>
  );
}

// ---- Main component ----
export default function EngagementDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [engagement, setEngagement] = useState(null);
  const [client, setClient] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('checklist');
  const [showAdhoc, setShowAdhoc] = useState(false);
  const [adhocDesc, setAdhocDesc] = useState('');

  const canEdit = user?.role === 'partner' || user?.role === 'manager' ||
    (user?.role === 'student' && engagement?.incharge === user?.name);
  const isPartnerManager = user?.role === 'partner' || user?.role === 'manager';

  async function load() {
    try {
      const eng = await api.engagements.get(id);
      setEngagement(eng);
      setItems(eng.items || []);
      if (eng.clientId) {
        api.clients.get(eng.clientId).then(setClient).catch(() => {});
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function updateItem(itemId, data) {
    const updated = await api.items.update(itemId, data);
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, ...data } : it));
  }

  async function addAdhoc() {
    if (!adhocDesc.trim()) return;
    try {
      await api.items.addAdhoc({ engagementId: id, description: adhocDesc.trim() });
      toast('Ad-hoc item added', 'success');
      setAdhocDesc('');
      setShowAdhoc(false);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function rollForward() {
    if (!confirm('Roll forward to next year? This creates a new engagement with all items reset to "No progress".')) return;
    try {
      const newEng = await api.engagements.rollForward(id);
      toast('Rolled forward to FY ' + newEng.year, 'success');
      navigate(`/engagements/${newEng.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (loading) return <div className="p-8 text-sm text-slate-400">Loading…</div>;
  if (!engagement) return <div className="p-8 text-sm text-deep">Engagement not found.</div>;

  const today = new Date().toISOString().split('T')[0];
  const isOverdue = engagement.dueDate && engagement.dueDate < today && engagement.status !== 'Completed';
  const total = items.length;
  const done = items.filter(it => it.status === 'Completed').length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Group items by section prefix (e.g. "A", "B", "C")
  const grouped = {};
  for (const it of items) {
    const key = it.description?.match(/^([A-Z]-\d+)/)?.[1]?.split('-')[0] || 'Other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(it);
  }

  const TABS = [
    { id: 'checklist', label: `Checklist (${total})` },
    { id: 'inbox', label: 'Inbox' },
    { id: 'documents', label: 'Documents' },
  ];

  return (
    <div className="stagger p-8 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
        <button onClick={() => navigate('/clients')} className="hover:text-ink">Clients</button>
        {client && <>
          <span>/</span>
          <button onClick={() => navigate(`/clients/${client.id}`)} className="hover:text-ink">{client.name}</button>
        </>}
        <span>/</span>
        <span className="text-ink">FY {engagement.year}</span>
      </div>

      {/* Header */}
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-[28px] leading-[1.2] font-medium text-ink tracking-[-0.01em]">
              {engagement.title}
            </h1>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
              <span>FY {engagement.year}</span>
              {engagement.incharge && <span>· In-charge: <span className="text-ink">{engagement.incharge}</span></span>}
              {engagement.dueDate && (
                <span className={isOverdue ? 'text-deep font-medium' : ''}>
                  · Due {engagement.dueDate}{isOverdue ? ' (overdue)' : ''}
                </span>
              )}
            </div>
          </div>
          {isPartnerManager && (
            <div className="flex gap-2 shrink-0">
              <Btn size="sm" kind="ghost" onClick={rollForward}>Roll forward</Btn>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-5 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-tint rounded-full overflow-hidden">
            <div
              className="h-full bg-green rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
            {done}/{total} · {pct}%
          </span>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-tint">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'text-ink font-medium border-green'
                : 'text-slate-500 border-transparent hover:text-ink'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* Checklist tab */}
      {tab === 'checklist' && (
        <div>
          <div className="flex justify-end mb-3">
            {canEdit && (
              <Btn size="sm" kind="ghost" onClick={() => setShowAdhoc(!showAdhoc)}>
                + Ad-hoc item
              </Btn>
            )}
          </div>

          {showAdhoc && (
            <div className="mb-4 bg-fog border border-tint rounded-md p-4 flex gap-2">
              <input
                value={adhocDesc}
                onChange={e => setAdhocDesc(e.target.value)}
                placeholder="Ad-hoc item description…"
                className="flex-1 border border-tint bg-paper text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green"
                onKeyDown={e => e.key === 'Enter' && addAdhoc()}
              />
              <Btn size="sm" onClick={addAdhoc} disabled={!adhocDesc.trim()}>Add</Btn>
              <Btn size="sm" kind="ghost" onClick={() => setShowAdhoc(false)}>Cancel</Btn>
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-sm text-slate-400">No items in this engagement yet.</p>
          ) : (
            <div className="bg-paper border border-tint rounded-lg overflow-hidden">
              {Object.entries(grouped).map(([section, sectionItems]) => (
                <div key={section}>
                  <div className="px-4 py-2 bg-fog border-b border-tint">
                    <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                      Section {section}
                    </span>
                    <span className="ml-2 text-[11px] text-slate-400 font-mono tabular-nums">
                      {sectionItems.filter(it => it.status === 'Completed').length}/{sectionItems.length}
                    </span>
                  </div>
                  {sectionItems.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onUpdate={updateItem}
                      canEdit={canEdit}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'inbox' && (
        <InboxTab engagementId={id} items={items} />
      )}

      {tab === 'documents' && (
        <DocumentsTab engagementId={id} items={items} />
      )}
    </div>
  );
}
