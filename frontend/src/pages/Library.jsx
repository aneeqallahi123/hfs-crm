import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Btn from '../components/Btn.jsx';
import EditableText from '../components/EditableText.jsx';
import { SECTION_NAMES } from '../lib/metrics.js';

const ORDER = { A: 0, B: 1, C: 2, D: 3 };

function AddSub({ onAdd }) {
  const [v, setV] = useState('');
  return (
    <div className="flex gap-2 pt-1">
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } }} placeholder="Add sub-category…" className="flex-1 border border-tint rounded px-2 py-1 text-sm focus:outline-none focus:border-green" />
      <Btn size="sm" kind="ghost" onClick={() => { if (v.trim()) { onAdd(v.trim()); setV(''); } }}>Add sub-category</Btn>
    </div>
  );
}

function AddDoc({ onAdd }) {
  const [v, setV] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="px-3 py-1.5 text-xs text-green hover:bg-fog w-full text-left">+ Add task</button>;
  return (
    <div className="px-3 py-1.5 flex gap-2">
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); setOpen(false); } }} placeholder="Task description…" className="flex-1 border border-tint rounded px-2 py-1 text-xs focus:outline-none focus:border-green" />
      <Btn size="sm" onClick={() => { if (v.trim()) { onAdd(v.trim()); setV(''); setOpen(false); } }}>Add</Btn>
      <Btn size="sm" kind="ghost" onClick={() => { setV(''); setOpen(false); }}>Cancel</Btn>
    </div>
  );
}

let tmpId = 0;
const newId = () => `tmp_${Date.now()}_${tmpId++}`;

export default function Library() {
  const { user } = useAuth();
  const toast = useToast();
  const [lib, setLib] = useState([]);
  const [names, setNames] = useState({ ...SECTION_NAMES });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [newCat, setNewCat] = useState('');

  const canEdit = user?.role === 'partner';

  useEffect(() => {
    api.library.get('audit')
      .then((data) => {
        const heads = Array.isArray(data) ? data : (data?.library || []);
        setLib(heads.map((h) => ({ id: h.id || h.headId, headId: h.headId, section: h.section, sub: h.sub, items: (h.items || []).map((it) => ({ ref: it.ref, p: it.p, req: it.req !== false })) })));
        setDirty(false);
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  const catCodes = Array.from(new Set([...Object.keys(names), ...lib.map((h) => h.section)]))
    .sort((a, b) => (ORDER[a] ?? 99) - (ORDER[b] ?? 99) || String(names[a] || a).localeCompare(String(names[b] || b)));

  function markDirty(fn) { setLib(fn); setDirty(true); }

  function addCategory() {
    if (!newCat.trim()) return;
    setNames((n) => ({ ...n, ['cat_' + newId()]: newCat.trim() }));
    setNewCat('');
    setDirty(true);
  }
  function removeCategory(code) {
    const heads = lib.filter((h) => h.section === code);
    const n = heads.reduce((a, h) => a + h.items.length, 0);
    const label = names[code] || code;
    if (!confirm(`Delete category "${label}"?${heads.length ? ` This removes ${heads.length} sub-categor${heads.length > 1 ? 'ies' : 'y'} and ${n} task${n === 1 ? '' : 's'} from the library.` : ''} Existing engagements are not affected.`)) return;
    markDirty((prev) => prev.filter((h) => h.section !== code));
    setNames((prev) => { const nn = { ...prev }; delete nn[code]; return nn; });
  }
  function renameCategory(code, name) { setNames((n) => ({ ...n, [code]: name })); setDirty(true); }
  function addHead(code, sub) { markDirty((prev) => [...prev, { id: newId(), headId: newId(), section: code, sub, items: [] }]); }
  function renameHead(id, sub) { markDirty((prev) => prev.map((h) => (h.id === id ? { ...h, sub } : h))); }
  function removeHead(id) { markDirty((prev) => prev.filter((h) => h.id !== id)); }
  function addItem(id, p) { markDirty((prev) => prev.map((h) => (h.id === id ? { ...h, items: [...h.items, { ref: '•', p, req: true }] } : h))); }
  function updateItem(id, idx, patch) { markDirty((prev) => prev.map((h) => (h.id === id ? { ...h, items: h.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) } : h))); }
  function removeItem(id, idx) { markDirty((prev) => prev.map((h) => (h.id === id ? { ...h, items: h.items.filter((_, i) => i !== idx) } : h))); }

  async function save() {
    setSaving(true);
    try {
      const payload = lib.map((h) => ({ headId: h.headId, section: h.section, sub: h.sub, items: h.items }));
      await api.library.save('audit', payload);
      toast('Library saved', 'success');
      setDirty(false);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="stagger p-8 max-w-4xl"><div className="text-sm text-slate-400">Loading library…</div></div>;

  return (
    <div className="stagger p-8 max-w-4xl">
      <header className="mb-6">
        <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Library</h1>
        <div className="mt-3 h-px w-12 bg-green" />
        <p className="text-sm text-slate-500 mt-1">
          The master list every audit starts from — categories, sub-categories, and the tasks inside them. Each task is either{' '}
          <span className="text-green font-medium">Client</span> (the client sends it) or <span className="text-deep font-medium">Team work</span> (our team performs it).
          Changes apply to new engagements and roll-forwards; existing engagements keep the list they were scoped with.
        </p>
      </header>

      {canEdit && (
        <div className="bg-paper border border-tint rounded-xl p-4 mb-6 flex items-end gap-2">
          <label className="flex-1 text-xs font-medium text-slate-500">
            New category
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }} placeholder="e.g. E · Group Reporting" className="w-full mt-1 border border-tint rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green" />
          </label>
          <Btn onClick={addCategory} disabled={!newCat.trim()}>Add category</Btn>
        </div>
      )}

      {catCodes.length === 0 && (
        <div className="border border-dashed border-tint rounded-lg p-8 text-center text-sm text-ink mb-5">This library is empty. Add a category above, then sub-categories and tasks inside it.</div>
      )}

      <div className="space-y-5">
        {catCodes.map((code) => {
          const heads = lib.filter((h) => h.section === code);
          const isC = collapsed[code];
          return (
            <div key={code} className="bg-paper border border-tint rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-tint flex items-center gap-2">
                <button onClick={() => setCollapsed({ ...collapsed, [code]: !isC })} className="text-slate-300 text-xs w-4">{isC ? '▸' : '▾'}</button>
                {canEdit ? (
                  <EditableText value={names[code] || code} onSave={(v) => renameCategory(code, v)} className="text-sm font-semibold text-ink flex-1" placeholder="Category name" />
                ) : <span className="text-sm font-semibold text-ink flex-1 px-1.5 py-0.5">{names[code] || code}</span>}
                <span className="text-xs text-slate-500 tabular-nums">
                  {heads.length} sub-categor{heads.length === 1 ? 'y' : 'ies'} ·{' '}
                  <span className="text-green">{heads.reduce((n, h) => n + h.items.filter((i) => i.req).length, 0)} client</span> ·{' '}
                  <span className="text-deep">{heads.reduce((n, h) => n + h.items.filter((i) => !i.req).length, 0)} team work</span>
                </span>
                {canEdit && <button onClick={() => removeCategory(code)} className="text-xs text-slate-400 hover:text-deep ml-2" title="Delete this category">Delete</button>}
              </div>
              {!isC && (
                <div className="p-3 space-y-3">
                  {heads.map((h) => (
                    <div key={h.id} className="border border-tint rounded-lg">
                      <div className="px-3 py-2 flex items-center gap-2 border-b border-tint bg-fog">
                        {canEdit ? (
                          <EditableText value={h.sub} onSave={(v) => renameHead(h.id, v)} className="text-sm font-medium text-ink flex-1" placeholder="Sub-category name" />
                        ) : <span className="text-sm font-medium text-ink flex-1 px-1.5 py-0.5">{h.sub}</span>}
                        <span className="text-xs text-slate-500 tabular-nums">
                          <span className="text-green">{h.items.filter((i) => i.req).length} client</span> ·{' '}
                          <span className="text-deep">{h.items.filter((i) => !i.req).length} team work</span>
                        </span>
                        {canEdit && <button onClick={() => { if (confirm(`Delete sub-category "${h.sub}" and its tasks?`)) removeHead(h.id); }} className="text-xs text-deep hover:bg-fog rounded px-2 py-0.5">Delete</button>}
                      </div>
                      <div className="divide-y divide-tint/60">
                        {h.items.map((it, idx) => (
                          <div key={idx} className="px-3 py-1.5 flex items-center gap-2">
                            {canEdit ? (
                              <>
                                <EditableText value={it.ref} onSave={(v) => updateItem(h.id, idx, { ref: v })} mono className="text-xs text-slate-400 w-14" placeholder="ref" />
                                <EditableText value={it.p} onSave={(v) => updateItem(h.id, idx, { p: v })} className="text-sm text-ink flex-1" placeholder="Task" />
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-slate-400 w-14 font-mono px-1.5">{it.ref}</span>
                                <span className="text-sm text-ink flex-1 px-1.5">{it.p}</span>
                              </>
                            )}
                            {canEdit ? (
                              <div className="flex rounded-md border border-tint overflow-hidden text-[11px] shrink-0" role="group" aria-label="Who provides this">
                                <button onClick={() => updateItem(h.id, idx, { req: true })} className={`px-2 py-1 ${it.req ? 'bg-green text-paper' : 'text-ink hover:bg-fog'}`} title="The client sends this to us">Client</button>
                                <button onClick={() => updateItem(h.id, idx, { req: false })} className={`px-2 py-1 border-l border-tint ${!it.req ? 'bg-deep text-paper' : 'text-ink hover:bg-fog'}`} title="Our team performs this">Team work</button>
                              </div>
                            ) : (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${it.req ? 'text-green border-green' : 'text-deep border-deep'}`}>{it.req ? 'Client' : 'Team work'}</span>
                            )}
                            {canEdit && <button onClick={() => removeItem(h.id, idx)} className="text-xs text-slate-300 hover:text-deep shrink-0">✕</button>}
                          </div>
                        ))}
                        {canEdit && <AddDoc onAdd={(p) => addItem(h.id, p)} />}
                      </div>
                    </div>
                  ))}
                  {canEdit && <AddSub onAdd={(sub) => addHead(code, sub)} />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && dirty && (
        <div className="fixed bottom-6 right-6">
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Btn>
        </div>
      )}
    </div>
  );
}
