import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import Btn from './Btn.jsx';

const TYPE_LABELS = { document: 'Document', number: 'Number', information: 'Information' };
const TYPE_COLORS = {
  document: 'text-blue-600 border-blue-200 bg-blue-50',
  number: 'text-violet-600 border-violet-200 bg-violet-50',
  information: 'text-amber-600 border-amber-200 bg-amber-50',
};

// ── Year selector ─────────────────────────────────────────────────────────────

function YearSelector({ years, selected, onSelect, onAdd }) {
  const [adding, setAdding] = useState(false);
  const [newYear, setNewYear] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  function submit() {
    const y = newYear.trim();
    if (!y) return;
    onAdd(y);
    setNewYear('');
    setAdding(false);
  }

  return (
    <div className="flex items-center flex-wrap gap-2 mb-5">
      <span className="text-xs font-medium text-slate-500 mr-1">Year:</span>
      {years.map((y) => (
        <button
          key={y}
          onClick={() => onSelect(y)}
          className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
            selected === y ? 'bg-green text-paper border-green' : 'border-tint text-ink hover:border-green'
          }`}
        >{y}</button>
      ))}
      {adding ? (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={newYear}
            onChange={(e) => setNewYear(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setAdding(false); setNewYear(''); } }}
            placeholder="e.g. FY2024"
            className="border border-tint rounded px-2 py-1 text-xs w-28 focus:outline-none focus:border-green"
          />
          <button onClick={submit} className="text-xs text-green hover:text-ink font-medium">Add</button>
          <button onClick={() => { setAdding(false); setNewYear(''); }} className="text-xs text-slate-400 hover:text-ink">✕</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="px-3 py-1 rounded-full border border-dashed border-tint text-xs text-slate-500 hover:border-green hover:text-green transition-colors"
        >+ Add year</button>
      )}
    </div>
  );
}

// ── Document upload cell ──────────────────────────────────────────────────────

function DocCell({ clientId, itemId, isCustom, year, values, onFileAdded, onFileRemoved }) {
  const toast = useToast();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(null);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('year', year);
      if (isCustom) fd.append('customItemId', itemId);
      else fd.append('libraryItemId', itemId);
      const res = await api.clientValues.upload(clientId, fd);
      if (res.error) throw new Error(res.error);
      onFileAdded({ id: res.id, fileName: res.fileName, downloadUrl: res.downloadUrl, minioKey: res.key });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function removeFile(valueId) {
    setRemoving(valueId);
    try {
      await api.clientValues.delete(clientId, valueId);
      onFileRemoved(valueId);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setRemoving(null);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="flex flex-col gap-1 min-w-[200px]">
      {values.map((v) => (
        <div key={v.id} className="flex items-center gap-1 group">
          <a
            href={v.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green hover:underline underline-offset-2 truncate max-w-[200px]"
            title={v.fileName}
          >
            {v.fileName}
          </a>
          <button
            onClick={() => removeFile(v.id)}
            disabled={removing === v.id}
            className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full text-[10px] text-slate-300 hover:text-deep hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100"
            title="Remove file"
          >
            {removing === v.id ? '…' : '✕'}
          </button>
        </div>
      ))}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-dashed cursor-pointer transition-colors text-xs ${
          dragging ? 'border-green bg-green/5 text-green' : 'border-tint text-slate-400 hover:border-green hover:text-green'
        }`}
      >
        {uploading ? <span>Uploading…</span> : <><span>📎</span><span>{values.length ? 'Add another file' : 'Upload or drag file'}</span></>}
        <input ref={inputRef} type="file" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
      </div>
    </div>
  );
}

// ── Text / Number cell ────────────────────────────────────────────────────────

function TextCell({ clientId, itemId, isCustom, year, taskType, value, onValueChange }) {
  const toast = useToast();
  const [v, setV] = useState(value?.textValue ?? '');
  const [saving, setSaving] = useState(false);
  const dirty = v !== (value?.textValue ?? '');

  async function save() {
    setSaving(true);
    try {
      const payload = { year, textValue: v };
      if (isCustom) payload.customItemId = itemId;
      else payload.libraryItemId = itemId;
      await api.clientValues.upsert(clientId, payload);
      onValueChange({ textValue: v });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type={taskType === 'number' ? 'number' : 'text'}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        placeholder={taskType === 'number' ? '0' : 'Enter value…'}
        className="border border-tint rounded px-2 py-1 text-xs focus:outline-none focus:border-green w-40"
      />
      {dirty && (
        <button onClick={save} disabled={saving} className="text-[10px] text-green hover:text-ink font-medium">
          {saving ? '…' : 'Save'}
        </button>
      )}
    </div>
  );
}

// ── Single task item row ──────────────────────────────────────────────────────

function ItemRow({ clientId, item, year, values, canEdit, onExclude, onValueChange, onFileAdded, onFileRemoved }) {
  const taskType = item.taskType || 'document';
  const singleValue = Array.isArray(values) ? values[0] : values;

  return (
    <div className={`px-3 py-3 flex items-start gap-2 ${item.excluded ? 'opacity-40' : ''}`}>
      <span className="text-xs text-slate-400 w-12 font-mono shrink-0 pt-0.5">{item.ref || '•'}</span>
      <span className="text-sm text-ink flex-1 min-w-0 pt-0.5">{item.p}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${TYPE_COLORS[taskType] || TYPE_COLORS.document}`}>
        {TYPE_LABELS[taskType]}
      </span>
      {year && !item.excluded && (
        <div className="shrink-0">
          {taskType === 'document' ? (
            <DocCell
              clientId={clientId}
              itemId={item.itemId}
              isCustom={item.isCustom}
              year={year}
              values={Array.isArray(values) ? values : []}
              onFileAdded={onFileAdded}
              onFileRemoved={onFileRemoved}
            />
          ) : (
            <TextCell
              clientId={clientId}
              itemId={item.itemId}
              isCustom={item.isCustom}
              year={year}
              taskType={taskType}
              value={singleValue}
              onValueChange={onValueChange}
            />
          )}
        </div>
      )}
      {canEdit && (
        <button
          onClick={() => onExclude(item)}
          className={`text-[10px] shrink-0 rounded px-1.5 py-0.5 border transition-colors mt-0.5 ${
            item.excluded
              ? 'border-green text-green hover:bg-green/10'
              : 'border-tint text-slate-400 hover:text-deep hover:border-deep'
          }`}
          title={item.excluded ? 'Include' : 'Remove for this client'}
        >
          {item.excluded ? '+ Include' : '✕'}
        </button>
      )}
    </div>
  );
}

// ── Add custom item form ──────────────────────────────────────────────────────

function AddCustomItem({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState('');
  const [taskType, setTaskType] = useState('document');
  const [req, setReq] = useState(true);

  function submit() {
    if (!p.trim()) return;
    onAdd({ p: p.trim(), taskType, req });
    setP('');
    setTaskType('document');
    setReq(true);
    setOpen(false);
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="px-3 py-1.5 text-xs text-green hover:bg-fog w-full text-left">+ Add custom item</button>
  );

  return (
    <div className="px-3 py-2 flex flex-wrap items-center gap-2 bg-fog/60">
      <input
        autoFocus
        value={p}
        onChange={(e) => setP(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
        placeholder="Item description…"
        className="flex-1 min-w-32 border border-tint rounded px-2 py-1 text-xs focus:outline-none focus:border-green"
      />
      <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="border border-tint rounded px-1.5 py-1 text-xs bg-paper focus:outline-none">
        <option value="document">Document</option>
        <option value="number">Number</option>
        <option value="information">Information</option>
      </select>
      <div className="flex rounded border border-tint overflow-hidden text-[11px]">
        <button onClick={() => setReq(true)} className={`px-2 py-1 ${req ? 'bg-green text-paper' : 'text-ink hover:bg-fog'}`}>Client</button>
        <button onClick={() => setReq(false)} className={`px-2 py-1 border-l border-tint ${!req ? 'bg-deep text-paper' : 'text-ink hover:bg-fog'}`}>Team</button>
      </div>
      <Btn size="sm" onClick={submit}>Add</Btn>
      <Btn size="sm" kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
    </div>
  );
}

// ── Sub-category (head) block ─────────────────────────────────────────────────

function HeadBlock({ clientId, head, year, valuesMap, canEdit, onExcludeHead, onExcludeItem, onUnexcludeItem, onAddCustomItem, onRemoveCustomItem, onValueChange, onFileAdded, onFileRemoved }) {
  const allItems = [...(head.items || []), ...(head.customItems || [])];
  const visibleCount = allItems.filter(i => !i.excluded).length;

  return (
    <div className={`border border-tint rounded-lg ${head.excluded ? 'opacity-50' : ''}`}>
      <div className="px-3 py-2 flex items-center gap-2 border-b border-tint bg-fog">
        <span className="text-sm font-medium text-ink flex-1">{head.sub}</span>
        {head.isCustom && <span className="text-[10px] px-1.5 py-0.5 rounded border border-tint text-slate-400">custom</span>}
        <span className="text-xs text-slate-400">{visibleCount} item{visibleCount !== 1 ? 's' : ''}</span>
        {canEdit && !head.isCustom && (
          <button
            onClick={() => onExcludeHead(head)}
            className={`text-[10px] rounded px-1.5 py-0.5 border transition-colors ${
              head.excluded ? 'border-green text-green hover:bg-green/10' : 'border-tint text-slate-400 hover:text-deep hover:border-deep'
            }`}
          >
            {head.excluded ? '+ Include section' : 'Remove section'}
          </button>
        )}
        {canEdit && head.isCustom && (
          <button onClick={() => onRemoveCustomItem && onExcludeHead(head)} className="text-[10px] text-slate-400 hover:text-deep">Delete</button>
        )}
      </div>
      {!head.excluded && (
        <div className="divide-y divide-tint/60">
          {allItems.map((item) => (
            <ItemRow
              key={item.itemId}
              clientId={clientId}
              item={item}
              year={year}
              values={valuesMap[item.itemId] ?? []}
              canEdit={canEdit}
              onExclude={(it) => it.isCustom ? onRemoveCustomItem(it.itemId) : (it.excluded ? onUnexcludeItem(it) : onExcludeItem(it))}
              onValueChange={(v) => onValueChange(item.itemId, v)}
              onFileAdded={(v) => onFileAdded(item.itemId, v)}
              onFileRemoved={(valueId) => onFileRemoved(item.itemId, valueId)}
            />
          ))}
          {canEdit && (
            <AddCustomItem onAdd={(data) => onAddCustomItem(head, data)} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Add custom sub-category form ──────────────────────────────────────────────

function AddCustomHead({ section, onAdd }) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState('');

  function submit() {
    if (!sub.trim()) return;
    onAdd(section, sub.trim());
    setSub('');
    setOpen(false);
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-xs text-slate-500 hover:text-green mt-2">+ Add custom sub-category</button>
  );

  return (
    <div className="flex items-center gap-2 mt-2">
      <input
        autoFocus
        value={sub}
        onChange={(e) => setSub(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
        placeholder="Sub-category name…"
        className="flex-1 border border-tint rounded px-2 py-1 text-xs focus:outline-none focus:border-green"
      />
      <Btn size="sm" onClick={submit}>Add</Btn>
      <Btn size="sm" kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClientLibrary({ clientId, module = 'audit', canEdit, initialOpen = false }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [library, setLibrary] = useState([]);
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [values, setValues] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const loadedRef = useRef(false);

  const valuesMap = {};
  for (const v of values) {
    const key = v.libraryItemId || v.customItemId;
    if (key) {
      if (!valuesMap[key]) valuesMap[key] = {};
      if (!valuesMap[key][v.year]) valuesMap[key][v.year] = [];
      valuesMap[key][v.year].push(v);
    }
  }

  function getValArr(itemId) {
    if (!selectedYear || !valuesMap[itemId]) return [];
    return valuesMap[itemId][selectedYear] || [];
  }

  async function loadLibrary() {
    setLoading(true);
    try {
      const [libRes, valRes] = await Promise.all([
        api.clientLibrary.get(clientId, module),
        api.clientValues.list(clientId),
      ]);
      const lib = libRes.library || [];
      setLibrary(lib);
      const ys = libRes.years || [];
      setYears(ys);
      if (ys.length && !selectedYear) setSelectedYear(ys[0]);
      setValues(Array.isArray(valRes) ? valRes : []);
      // collapse all sections by default on first load
      if (!loadedRef.current) {
        const initial = {};
        for (const sec of lib) initial[sec.section] = true;
        setCollapsed(initial);
        loadedRef.current = true;
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLibrary(); }, [clientId]);

  function addYear(y) {
    if (!years.includes(y)) setYears([y, ...years]);
    setSelectedYear(y);
    // collapse all sections when viewing a year for the first time
    setCollapsed(prev => {
      const next = { ...prev };
      for (const sec of library) {
        if (!(sec.section in next)) next[sec.section] = true;
      }
      return next;
    });
  }

  async function excludeHead(head) {
    try {
      if (head.isCustom) {
        await api.clientLibrary.removeCustomHead(clientId, head.headId);
      } else {
        await api.clientLibrary.excludeHead(clientId, head.headId);
      }
      loadLibrary();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function excludeItem(item) {
    try {
      await api.clientLibrary.excludeItem(clientId, item.itemId);
      loadLibrary();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function unexcludeItem(item) {
    try {
      await api.clientLibrary.unexcludeItem(clientId, item.itemId);
      loadLibrary();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function addCustomHead(section, sub) {
    try {
      await api.clientLibrary.addCustomHead(clientId, section, sub);
      loadLibrary();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function addCustomItem(head, data) {
    try {
      if (head.isCustom) {
        await api.clientLibrary.addCustomItemToCustomHead(clientId, head.headId, data);
      } else {
        await api.clientLibrary.addCustomItemToHead(clientId, head.headId, data);
      }
      loadLibrary();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function removeCustomItem(itemId) {
    try {
      await api.clientLibrary.removeCustomItem(clientId, itemId);
      loadLibrary();
    } catch (err) { toast(err.message, 'error'); }
  }

  function handleValueChange(itemId, newVal) {
    setValues(prev => {
      const existingIdx = prev.findIndex(v => (v.libraryItemId === itemId || v.customItemId === itemId) && v.year === selectedYear);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], ...newVal };
        return updated;
      }
      return [...prev, { libraryItemId: itemId, customItemId: null, year: selectedYear, ...newVal }];
    });
  }

  function handleFileAdded(itemId, newVal) {
    setValues(prev => [...prev, { libraryItemId: itemId, customItemId: null, year: selectedYear, ...newVal }]);
  }

  function handleFileRemoved(itemId, valueId) {
    setValues(prev => prev.filter(v => v.id !== valueId));
  }

  return (
    <div className="mt-8">
      <div className="mb-4">
        <h2 className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
          Reference Data
        </h2>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-4">Loading…</div>
      ) : (
        <>
          <YearSelector
            years={years}
            selected={selectedYear}
            onSelect={setSelectedYear}
            onAdd={addYear}
          />

          {!selectedYear ? (
            <p className="text-xs text-slate-400 mt-1">Add or select a year above to view and fill in reference data.</p>
          ) : library.length === 0 ? (
            <p className="text-sm text-slate-400">No library data available for this module.</p>
          ) : (
            <div className="space-y-6">
              {library.map((section) => {
                const isC = collapsed[section.section];
                const totalVisible = section.heads.reduce((n, h) => n + (!h.excluded ? 1 : 0), 0);
                return (
                  <div key={section.section}>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => setCollapsed(p => ({ ...p, [section.section]: !isC }))}
                        className="text-slate-400 text-xs"
                      >{isC ? '▸' : '▾'}</button>
                      <span className="text-sm font-semibold text-ink">{section.sectionName}</span>
                      <span className="text-xs text-slate-400">{totalVisible} sub-categor{totalVisible !== 1 ? 'ies' : 'y'}</span>
                    </div>
                    {!isC && (
                      <div className="space-y-3 pl-4">
                        {section.heads.map((head) => (
                          <HeadBlock
                            key={head.headId}
                            clientId={clientId}
                            head={head}
                            year={selectedYear}
                            valuesMap={Object.fromEntries(
                              Object.entries(valuesMap).map(([id, byYear]) => [id, byYear[selectedYear] || []])
                            )}
                            canEdit={canEdit}
                            onExcludeHead={excludeHead}
                            onExcludeItem={excludeItem}
                            onUnexcludeItem={unexcludeItem}
                            onAddCustomItem={addCustomItem}
                            onRemoveCustomItem={removeCustomItem}
                            onValueChange={handleValueChange}
                            onFileAdded={handleFileAdded}
                            onFileRemoved={handleFileRemoved}
                          />
                        ))}
                        {canEdit && (
                          <AddCustomHead section={section.section} onAdd={addCustomHead} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
