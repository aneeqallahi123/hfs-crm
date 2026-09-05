import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Btn from '../components/Btn.jsx';

const SECTION_NAMES = {
  A: 'A · Permanent File',
  B: 'B · Planning File',
  C: 'C · General Procedures',
  D: 'D · Head-Wise Audit',
};

function ItemRow({ item, canEdit, onChange, onDelete }) {
  return (
    <div className="flex items-start gap-2 px-4 py-2 border-b border-tint last:border-0 hover:bg-fog/30 group">
      <span className="shrink-0 font-mono text-[11px] text-slate-400 pt-0.5 w-10">{item.ref}</span>
      <div className="flex-1 min-w-0">
        {canEdit ? (
          <input
            value={item.p}
            onChange={e => onChange({ ...item, p: e.target.value })}
            className="w-full bg-transparent text-sm text-ink focus:outline-none focus:bg-white focus:px-1 rounded"
          />
        ) : (
          <span className="text-sm text-ink">{item.p}</span>
        )}
      </div>
      {canEdit && (
        <label className="shrink-0 flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer">
          <input
            type="checkbox"
            checked={item.req}
            onChange={e => onChange({ ...item, req: e.target.checked })}
            className="accent-green"
          />
          Client
        </label>
      )}
      {!canEdit && item.req && (
        <span className="shrink-0 text-[10px] bg-fog border border-tint px-1.5 py-0.5 rounded-full text-slate-500">Client</span>
      )}
      {canEdit && (
        <button
          onClick={onDelete}
          className="shrink-0 text-slate-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity text-sm leading-none"
          title="Remove item"
        >×</button>
      )}
    </div>
  );
}

function HeadGroup({ head, canEdit, onChange, onDelete, onAddItem }) {
  const [collapsed, setCollapsed] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);

  function updateItem(idx, updated) {
    const items = [...head.items];
    items[idx] = updated;
    onChange({ ...head, items });
  }

  function deleteItem(idx) {
    const items = head.items.filter((_, i) => i !== idx);
    onChange({ ...head, items });
  }

  function addItem() {
    if (!newItem.trim()) return;
    const nextRef = `${head.section}-${Date.now()}`;
    onChange({
      ...head,
      items: [...head.items, { ref: nextRef, p: newItem.trim(), req: true }],
    });
    setNewItem('');
    setAdding(false);
  }

  const sectionLabel = SECTION_NAMES[head.section] || head.section;

  return (
    <div className="mb-3 border border-tint rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-fog">
        <button
          onClick={() => setCollapsed(v => !v)}
          className="shrink-0 text-[10px] text-slate-400 w-4"
        >{collapsed ? '▸' : '▾'}</button>
        <span className="text-[10px] text-slate-400 shrink-0">{sectionLabel}</span>
        <span className="text-slate-400 text-[10px] mx-1">/</span>
        {canEdit ? (
          <input
            value={head.sub}
            onChange={e => onChange({ ...head, sub: e.target.value })}
            className="flex-1 bg-transparent text-sm font-medium text-ink focus:outline-none"
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-ink">{head.sub}</span>
        )}
        <span className="shrink-0 text-xs text-slate-400">{head.items.length} items</span>
        {canEdit && (
          <button
            onClick={onDelete}
            className="shrink-0 text-slate-300 hover:text-rose-400 text-sm leading-none ml-2"
            title="Delete head"
          >×</button>
        )}
      </div>
      {!collapsed && (
        <div className="bg-paper">
          {head.items.map((it, idx) => (
            <ItemRow
              key={idx}
              item={it}
              canEdit={canEdit}
              onChange={updated => updateItem(idx, updated)}
              onDelete={() => deleteItem(idx)}
            />
          ))}
          {canEdit && (
            <div className="px-4 py-2">
              {adding ? (
                <div className="flex gap-2 items-center">
                  <input
                    autoFocus
                    value={newItem}
                    onChange={e => setNewItem(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addItem(); if (e.key === 'Escape') setAdding(false); }}
                    placeholder="New task description…"
                    className="flex-1 text-sm border border-tint rounded-md px-2 py-1 focus:outline-none focus:border-green"
                  />
                  <Btn size="sm" onClick={addItem}>Add</Btn>
                  <Btn size="sm" kind="ghost" onClick={() => setAdding(false)}>Cancel</Btn>
                </div>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="text-xs text-slate-400 hover:text-green transition-colors"
                >+ Add task</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Library() {
  const { user } = useAuth();
  const toast = useToast();
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState('');

  const isPartner = user?.role === 'partner';

  useEffect(() => {
    api.library.get('audit')
      .then(lib => { setLibrary(lib); setDirty(false); })
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  function updateHead(idx, updated) {
    setLibrary(prev => { const next = [...prev]; next[idx] = updated; return next; });
    setDirty(true);
  }

  function deleteHead(idx) {
    setLibrary(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  function addHead(section) {
    const newHead = {
      headId: `${section}::new-${Date.now()}`,
      section,
      sub: 'New head',
      items: [],
    };
    setLibrary(prev => [...prev, newHead]);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await api.library.save('audit', library);
      toast('Library saved', 'success');
      setDirty(false);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const sections = ['A', 'B', 'C', 'D'];
  const filtered = filter
    ? library.filter(h =>
        h.sub.toLowerCase().includes(filter.toLowerCase()) ||
        h.items.some(it => it.p.toLowerCase().includes(filter.toLowerCase()))
      )
    : library;

  const bySection = sections.reduce((acc, s) => {
    acc[s] = filtered.filter(h => h.section === s);
    return acc;
  }, {});

  const totalItems = library.reduce((acc, h) => acc + h.items.length, 0);

  return (
    <div className="stagger p-8 max-w-5xl">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">
              Audit Library
            </h1>
            <div className="mt-3 h-px w-12 bg-green" />
            <p className="text-sm text-slate-500 mt-2">
              Master checklist template — {library.length} heads, {totalItems} items
            </p>
          </div>
          {isPartner && dirty && (
            <Btn onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Btn>
          )}
        </div>
      </header>

      {/* Search */}
      <div className="mb-6">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter heads and tasks…"
          className="w-full max-w-md border border-tint rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green"
        />
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading library…</div>
      ) : (
        <div>
          {sections.map(section => (
            <div key={section} className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-ink">
                  {SECTION_NAMES[section]}
                  <span className="ml-2 text-xs text-slate-400 font-normal">({bySection[section].length} heads)</span>
                </h2>
                {isPartner && !filter && (
                  <button
                    onClick={() => addHead(section)}
                    className="text-xs text-slate-400 hover:text-green transition-colors"
                  >+ Add head</button>
                )}
              </div>
              {bySection[section].length === 0 ? (
                <p className="text-xs text-slate-400 mb-4">No heads in this section.</p>
              ) : (
                bySection[section].map((head, idx) => {
                  const realIdx = library.indexOf(head);
                  return (
                    <HeadGroup
                      key={head.headId || idx}
                      head={head}
                      canEdit={isPartner}
                      onChange={updated => updateHead(realIdx, updated)}
                      onDelete={() => deleteHead(realIdx)}
                    />
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}

      {isPartner && dirty && (
        <div className="fixed bottom-6 right-6">
          <Btn onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Btn>
        </div>
      )}
    </div>
  );
}
