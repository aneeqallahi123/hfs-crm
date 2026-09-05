import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Btn from '../components/Btn.jsx';
import Modal from '../components/Modal.jsx';
import Field from '../components/Field.jsx';

// DB statuses — must match CHECK constraint exactly
const STATUSES = ['No progress', 'Requested', 'Under Review', 'Completed', 'NA'];

// Display labels for status pills/dropdowns
const STATUS_LABEL = {
  'No progress': 'Not started',
  'Requested': 'Awaited',
  'Under Review': 'To review',
  'Completed': 'Complete',
  'NA': 'N/A',
};

function statusStyle(s) {
  if (s === 'Completed') return 'bg-fog text-green border-green/40';
  if (s === 'Requested') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'Under Review') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s === 'NA') return 'bg-fog text-slate-400 border-tint';
  return 'bg-paper text-slate-400 border-tint';
}

function kindDot(kind) {
  if (kind === 'document') return 'bg-blue-400';
  if (kind === 'confirmation') return 'bg-purple-400';
  if (kind === 'procedure') return 'bg-tint';
  return 'bg-slate-300';
}

// ---- Scope Panel Modal ----
function ScopeModal({ items, onClose, onSaved }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  // Build heads map: headId -> { sub, section, included, items[] }
  const headsMap = {};
  for (const it of items) {
    if (!it.headId) continue;
    if (!headsMap[it.headId]) {
      headsMap[it.headId] = {
        headId: it.headId,
        sub: it.sub || it.headId,
        section: it.section || '?',
        included: it.headIncluded !== false,
        items: [],
      };
    }
    headsMap[it.headId].items.push(it);
    // If any item is included, mark head included
    if (it.headIncluded) headsMap[it.headId].included = true;
  }

  const SECTION_NAMES = {
    A: 'A · Permanent File',
    B: 'B · Planning File',
    C: 'C · General Procedures',
    D: 'D · Head-Wise Audit',
  };

  const [state, setState] = useState(headsMap);

  function toggle(headId) {
    setState(prev => ({
      ...prev,
      [headId]: { ...prev[headId], included: !prev[headId].included },
    }));
  }

  async function apply() {
    setSaving(true);
    try {
      const updates = [];
      for (const [headId, head] of Object.entries(state)) {
        for (const it of head.items) {
          const current = items.find(i => i.id === it.id);
          if (current && current.headIncluded !== head.included) {
            updates.push({ id: it.id, headIncluded: head.included });
          }
        }
      }
      if (updates.length) {
        await api.items.bulkUpdate(updates);
      }
      toast('Scope updated', 'success');
      onSaved();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const sections = ['A', 'B', 'C', 'D'];
  const bySection = sections.reduce((acc, s) => {
    acc[s] = Object.values(state).filter(h => h.section === s);
    return acc;
  }, {});

  return (
    <Modal title="Engagement scope" onClose={onClose} wide>
      <p className="text-xs text-slate-500 mb-4">Toggle which library sections apply to this engagement. Excluded heads are hidden from the checklist.</p>
      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
        {sections.map(section => {
          const heads = bySection[section];
          if (!heads.length) return null;
          return (
            <div key={section}>
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                {SECTION_NAMES[section]}
              </h3>
              <div className="space-y-1">
                {heads.map(head => (
                  <label key={head.headId} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-fog cursor-pointer">
                    <input
                      type="checkbox"
                      checked={head.included}
                      onChange={() => toggle(head.headId)}
                      className="accent-green"
                    />
                    <span className="text-sm text-ink">{head.sub}</span>
                    <span className="ml-auto text-xs text-slate-400">{head.items.length} items</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-tint mt-4">
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={apply} disabled={saving}>{saving ? 'Applying…' : 'Apply'}</Btn>
      </div>
    </Modal>
  );
}

// ---- Item row ----
function ItemRow({ item, onUpdate, canEdit, teamMembers }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState({
    status: item.status,
    remarks: item.remarks || '',
    due: item.due || '',
    owner: item.owner || '',
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function save() {
    setSaving(true);
    try {
      await onUpdate(item.id, draft);
      setExpanded(false);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status) {
    const next = { ...draft, status };
    setDraft(next);
    try {
      await onUpdate(item.id, { status });
    } catch (err) {
      toast(err.message, 'error');
      setDraft(d => ({ ...d, status: item.status }));
    }
  }

  return (
    <div className={`border-b border-tint last:border-0 ${item.status === 'Completed' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-fog/50 transition-colors">
        {/* Kind dot */}
        <div className="shrink-0 mt-1.5">
          <span className={`block w-2 h-2 rounded-full ${kindDot(item.kind)}`} title={item.kind || 'item'} />
        </div>

        {/* Ref */}
        {item.ref && (
          <span className="shrink-0 font-mono text-[11px] text-slate-400 pt-0.5 w-10">{item.ref}</span>
        )}

        {/* Description */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink leading-snug">{item.p}</p>
          {item.remarks && !expanded && (
            <p className="text-xs text-slate-500 mt-0.5 italic">"{item.remarks}"</p>
          )}
          {item.due && !expanded && (
            <p className="text-xs text-slate-400 mt-0.5">Due: {item.due}</p>
          )}

          {expanded && (
            <div className="mt-3 space-y-2">
              {canEdit && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Owner</label>
                    <select
                      value={draft.owner}
                      onChange={e => setDraft(d => ({ ...d, owner: e.target.value }))}
                      className="w-full border border-tint rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-green"
                    >
                      <option value="">— unassigned —</option>
                      {teamMembers.map(m => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Due</label>
                    <input
                      type="date"
                      value={draft.due}
                      onChange={e => setDraft(d => ({ ...d, due: e.target.value }))}
                      className="w-full border border-tint rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-green"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs text-slate-500 block mb-1">Remarks</label>
                <textarea
                  value={draft.remarks}
                  onChange={e => setDraft(d => ({ ...d, remarks: e.target.value }))}
                  placeholder="Add a remark…"
                  rows={2}
                  readOnly={!canEdit}
                  className="w-full border border-tint rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green resize-none"
                />
              </div>
              {canEdit && (
                <div className="flex gap-2 justify-end">
                  <Btn size="sm" kind="ghost" onClick={() => setExpanded(false)}>Cancel</Btn>
                  <Btn size="sm" onClick={save} disabled={saving}>{saving ? '…' : 'Save'}</Btn>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Owner badge */}
        {item.owner && !expanded && (
          <span className="shrink-0 text-[11px] text-slate-400 pt-0.5">{item.owner}</span>
        )}

        {/* Status */}
        <div className="shrink-0 pt-0.5">
          {canEdit ? (
            <select
              value={draft.status}
              onChange={e => changeStatus(e.target.value)}
              className={`text-[11px] rounded-full border pl-2.5 pr-6 py-0.5 focus:outline-none cursor-pointer appearance-none ${statusStyle(draft.status)}`}
              style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%231C1C1C' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
            >
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          ) : (
            <span className={`text-[11px] rounded-full border px-2.5 py-0.5 ${statusStyle(draft.status)}`}>
              {STATUS_LABEL[draft.status] || draft.status}
            </span>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="shrink-0 text-slate-400 hover:text-ink pt-0.5 text-xs"
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>
    </div>
  );
}

// ---- Section group ----
function SectionGroup({ label, items, onUpdate, canEdit, teamMembers }) {
  const [collapsed, setCollapsed] = useState(false);
  const done = items.filter(it => it.status === 'Completed').length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="mb-4">
      <button
        className="w-full flex items-center gap-3 px-4 py-2 bg-fog border border-tint rounded-t-lg text-left hover:bg-tint/30 transition-colors"
        onClick={() => setCollapsed(v => !v)}
      >
        <span className="text-xs font-medium text-ink flex-1">{label}</span>
        <span className="text-xs text-slate-500">{done}/{items.length}</span>
        <div className="w-24 h-1.5 rounded-full bg-tint overflow-hidden">
          <div className="h-full bg-green rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-slate-400 w-6 text-right">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <div className="bg-paper border border-t-0 border-tint rounded-b-lg overflow-hidden">
          {items.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              onUpdate={onUpdate}
              canEdit={canEdit}
              teamMembers={teamMembers}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Inbox tab ----
function InboxTab({ engagementId, items }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    api.inbox.list(engagementId)
      .then(r => setFiles(Array.isArray(r) ? r : []))
      .catch(() => {})
      .finally(() => setLoading(false));
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
                    <option key={it.id} value={it.id}>{(it.p || '').slice(0, 60)}</option>
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
                    <div className="text-xs text-slate-500 truncate">→ {item?.p || f.assignedItemId}</div>
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
function DocumentsTab({ engagementId }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();
  const toast = useToast();

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

// ---- Stage count bar ----
function StageBar({ items, activeFilter, onFilter }) {
  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = items.filter(i => i.status === s).length;
    return acc;
  }, {});

  const pillColors = {
    'No progress': 'bg-slate-100 text-slate-500 border-slate-200',
    'Requested': 'bg-amber-50 text-amber-700 border-amber-200',
    'Under Review': 'bg-blue-50 text-blue-700 border-blue-200',
    'Completed': 'bg-fog text-green border-green/30',
    'NA': 'bg-fog text-slate-400 border-tint',
  };

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <button
        onClick={() => onFilter(null)}
        className={`text-xs px-3 py-1 rounded-full border transition-colors ${activeFilter === null ? 'bg-green text-paper border-green' : 'bg-paper text-slate-500 border-tint hover:border-green'}`}
      >
        All ({items.length})
      </button>
      {STATUSES.map(s => (
        <button
          key={s}
          onClick={() => onFilter(activeFilter === s ? null : s)}
          className={`text-xs px-3 py-1 rounded-full border transition-all ${activeFilter === s ? 'ring-2 ring-green ring-offset-1' : ''} ${pillColors[s]}`}
        >
          {STATUS_LABEL[s]} ({counts[s]})
        </button>
      ))}
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
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('checklist');
  const [showAdhoc, setShowAdhoc] = useState(false);
  const [showScope, setShowScope] = useState(false);
  const [adhocDesc, setAdhocDesc] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);

  const canEdit = user?.role === 'partner' || user?.role === 'manager' ||
    (user?.role === 'student' && engagement?.incharge === user?.name);
  const isPartnerManager = user?.role === 'partner' || user?.role === 'manager';

  async function load() {
    try {
      const [eng, its] = await Promise.all([
        api.engagements.get(id),
        api.items.list(id),
      ]);
      setEngagement(eng);
      setItems(Array.isArray(its) ? its : []);
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

  useEffect(() => {
    if (user?.role !== 'student') {
      api.team.list().then(t => setTeamMembers(Array.isArray(t) ? t.filter(m => m.active !== false) : [])).catch(() => {});
    }
  }, [user]);

  async function updateItem(itemId, data) {
    await api.items.update(itemId, data);
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, ...data } : it));
  }

  async function addAdhoc() {
    if (!adhocDesc.trim()) return;
    try {
      await api.items.addAdhoc({ engagementId: id, p: adhocDesc.trim() });
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
      const result = await api.engagements.rollForward(id);
      toast('Rolled forward to FY ' + result.year, 'success');
      navigate(`/engagements/${result.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (loading) return <div className="p-8 text-sm text-slate-400">Loading…</div>;
  if (!engagement) return <div className="p-8 text-sm text-deep">Engagement not found.</div>;

  const today = new Date().toISOString().split('T')[0];
  const isOverdue = engagement.deadline && engagement.deadline < today;

  // Only show items where headIncluded is not explicitly false
  const scopedItems = items.filter(it => it.headIncluded !== false);

  const total = scopedItems.length;
  const done = scopedItems.filter(it => it.status === 'Completed').length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Filter by status if active
  const visibleItems = statusFilter ? scopedItems.filter(it => it.status === statusFilter) : scopedItems;

  // Group by headId then sub
  const grouped = {};
  for (const it of visibleItems) {
    const key = it.headId || 'Ungrouped';
    if (!grouped[key]) grouped[key] = { label: it.sub || it.section || key, items: [] };
    grouped[key].items.push(it);
  }
  const groupEntries = Object.entries(grouped);

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
            <h1 className="font-serif text-[28px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">
              {client?.name || '…'} · FY {engagement.year}
            </h1>
            <div className="mt-2 h-px w-12 bg-green" />
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="capitalize">{engagement.module}</span>
              {engagement.incharge && <span>In-charge: {engagement.incharge}</span>}
              {engagement.deadline && (
                <span className={isOverdue ? 'text-deep font-medium' : ''}>
                  {isOverdue ? 'Overdue · ' : 'Deadline: '}{engagement.deadline}
                </span>
              )}
            </div>
          </div>

          {/* Progress ring */}
          <div className="shrink-0 flex flex-col items-center gap-1">
            <svg width="56" height="56" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="22" fill="none" stroke="#C9DBD2" strokeWidth="5" />
              <circle
                cx="28" cy="28" r="22" fill="none"
                stroke="#147B58" strokeWidth="5"
                strokeDasharray={`${2 * Math.PI * 22}`}
                strokeDashoffset={`${2 * Math.PI * 22 * (1 - pct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 28 28)"
              />
              <text x="28" y="33" textAnchor="middle" className="font-mono" fontSize="11" fill="#1C1C1C">{pct}%</text>
            </svg>
            <span className="text-[10px] text-slate-400">{done}/{total} done</span>
          </div>
        </div>

        {/* Actions */}
        {isPartnerManager && (
          <div className="mt-4 flex gap-2">
            <Btn size="sm" kind="ghost" onClick={() => setShowAdhoc(true)}>+ Ad-hoc item</Btn>
            <Btn size="sm" kind="ghost" onClick={() => setShowScope(true)}>Scope</Btn>
            <Btn size="sm" kind="ghost" onClick={rollForward}>Roll forward →</Btn>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-tint mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === t.id ? 'border-green text-ink font-medium' : 'border-transparent text-slate-500 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Checklist */}
      {tab === 'checklist' && (
        <div>
          {total > 0 && (
            <StageBar items={scopedItems} activeFilter={statusFilter} onFilter={setStatusFilter} />
          )}

          {groupEntries.length === 0 ? (
            <p className="text-sm text-slate-400">No items{statusFilter ? ` with status "${STATUS_LABEL[statusFilter] || statusFilter}"` : ''}.</p>
          ) : (
            groupEntries.map(([key, { label, items: groupItems }]) => (
              <SectionGroup
                key={key}
                label={label}
                items={groupItems}
                onUpdate={updateItem}
                canEdit={canEdit}
                teamMembers={teamMembers}
              />
            ))
          )}
        </div>
      )}

      {/* Inbox */}
      {tab === 'inbox' && <InboxTab engagementId={id} items={scopedItems} />}

      {/* Documents */}
      {tab === 'documents' && <DocumentsTab engagementId={id} />}

      {/* Ad-hoc modal */}
      {showAdhoc && (
        <Modal title="Add ad-hoc item" onClose={() => setShowAdhoc(false)}>
          <Field
            label="Description"
            value={adhocDesc}
            onChange={setAdhocDesc}
            placeholder="Describe the additional item…"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Btn kind="ghost" onClick={() => setShowAdhoc(false)}>Cancel</Btn>
            <Btn onClick={addAdhoc} disabled={!adhocDesc.trim()}>Add item</Btn>
          </div>
        </Modal>
      )}

      {/* Scope modal */}
      {showScope && (
        <ScopeModal
          items={items}
          onClose={() => setShowScope(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
