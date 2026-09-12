import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Btn from '../components/Btn.jsx';
import { sectionLabel } from '../lib/metrics.js';

export default function EngagementScope() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [engagement, setEngagement] = useState(null);
  const [client, setClient] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [collSections, setCollSections] = useState({});
  const [openHead, setOpenHead] = useState(null);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingSubInSection, setAddingSubInSection] = useState(null);
  const [newSubName, setNewSubName] = useState('');
  const [addingTaskInHead, setAddingTaskInHead] = useState(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskReq, setNewTaskReq] = useState(false);

  const canEdit = user?.role === 'partner' || user?.role === 'manager';

  async function load() {
    try {
      const [eng, its] = await Promise.all([api.engagements.get(id), api.items.list(id)]);
      setEngagement(eng);
      setItems(Array.isArray(its) ? its : []);
      if (eng.clientId) api.clients.get(eng.clientId).then(setClient).catch(() => {});
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function updateItem(itemId, patch) {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, ...patch } : it));
    try { await api.items.update(itemId, patch); }
    catch (err) { toast(err.message, 'error'); load(); }
  }

  async function setHeadIncluded(headId, val) {
    const ids = items.filter(it => it.headId === headId).map(it => it.id);
    setItems(prev => prev.map(it => it.headId === headId ? { ...it, headIncluded: val } : it));
    try { await api.items.bulkUpdate(ids.map(i => ({ id: i, headIncluded: val }))); }
    catch (err) { toast(err.message, 'error'); load(); }
  }

  async function doAddTask(head) {
    if (!newTaskText.trim()) return;
    try {
      await api.items.addAdhoc({ engagementId: id, p: newTaskText.trim(), section: head.section, sub: head.sub, headId: head.headId, requestable: newTaskReq });
      setAddingTaskInHead(null); setNewTaskText(''); setNewTaskReq(false);
      load();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function doAddSub(section) {
    if (!newSubName.trim()) return;
    const headId = `custom_${section}_${Date.now()}`;
    try {
      await api.items.addAdhoc({ engagementId: id, p: 'New task', section, sub: newSubName.trim(), headId, requestable: false });
      setAddingSubInSection(null); setNewSubName('');
      load();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function doAddCategory() {
    if (!newCatName.trim()) return;
    const usedSections = new Set(items.map(it => it.section));
    const sec = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('').find(l => !usedSections.has(l)) || `X${Date.now()}`;
    const headId = `custom_cat_${Date.now()}`;
    try {
      await api.items.addAdhoc({ engagementId: id, p: 'New task', section: sec, sub: newCatName.trim(), headId, requestable: false });
      setAddingCategory(false); setNewCatName('');
      load();
    } catch (err) { toast(err.message, 'error'); }
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;

  const headsMap = {};
  for (const it of items) {
    if (it.headId === 'adhoc') continue;
    if (!headsMap[it.headId]) headsMap[it.headId] = { headId: it.headId, section: it.section, sub: it.sub, items: [] };
    headsMap[it.headId].items.push(it);
  }
  const seenOrder = {};
  items.forEach((it, i) => { if (seenOrder[it.headId] === undefined) seenOrder[it.headId] = i; });
  const orderedHeads = Object.values(headsMap).sort((a, b) => (seenOrder[a.headId] ?? 999) - (seenOrder[b.headId] ?? 999));

  const bySection = {};
  for (const h of orderedHeads) (bySection[h.section] = bySection[h.section] || []).push(h);

  const included = orderedHeads.filter(h => h.items[0]?.headIncluded);
  const totals = included.reduce((acc, h) => {
    h.items.forEach(it => { if (it.status !== 'NA') (it.requestable ? acc.client++ : acc.team++); });
    return acc;
  }, { client: 0, team: 0 });

  const clientName = client?.name || '';
  const yearLabel = engagement ? `FY ${engagement.year}` : '';

  return (
    <div className="stagger p-8 max-w-4xl">
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
        <span className="text-slate-600">Scope</span>
      </div>

      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">
              {clientName ? `Scope for ${clientName}` : 'Scope'}
            </h1>
            <div className="mt-3 h-px w-12 bg-green" />
            <p className="text-sm text-slate-500 mt-1">
              Tick the areas that apply. Inside each, mark every task as{' '}
              <span className="font-medium text-green">Client</span> (WhatsApp request) or{' '}
              <span className="font-medium text-deep">Team work</span> (internal).
            </p>
          </div>
          <div className="flex items-stretch gap-4 shrink-0 mt-1">
            <div className="text-right">
              <div className="text-2xl font-semibold text-green tabular-nums leading-none">{totals.client}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">client tasks</div>
            </div>
            <div className="w-px bg-tint self-stretch" />
            <div className="text-right">
              <div className="text-2xl font-semibold text-deep tabular-nums leading-none">{totals.team}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">team tasks</div>
            </div>
            <div className="w-px bg-tint self-stretch" />
            <Btn onClick={() => navigate(`/engagements/${id}`)}>Done</Btn>
          </div>
        </div>
      </header>

      {/* Library catalogue */}
      <div className="mb-4 rounded-lg border border-tint bg-fog/40 overflow-hidden">
        <button
          onClick={() => setCatalogueOpen(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-fog/60 transition-colors"
        >
          <span className={`text-slate-400 text-[10px] transition-transform duration-150 ${catalogueOpen ? '' : '-rotate-90'}`}>▾</span>
          <span className="text-xs font-medium text-slate-600">Available in the library</span>
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
                  {hs.map(h => {
                    const on = h.items[0]?.headIncluded;
                    return (
                      <button
                        key={h.headId}
                        disabled={on || !canEdit}
                        onClick={() => !on && canEdit && setHeadIncluded(h.headId, true)}
                        className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                          on ? 'border-tint text-slate-400 opacity-50 cursor-default'
                            : canEdit ? 'border-tint text-ink hover:border-green hover:text-green cursor-pointer'
                            : 'border-tint text-slate-400 cursor-default'
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

      {/* In-scope areas */}
      <div className="space-y-2">
        {Object.entries(bySection).map(([sec, hs]) => {
          const includedHs = hs.filter(h => h.items[0]?.headIncluded);
          if (includedHs.length === 0) return null;
          const secClient = includedHs.reduce((n, h) => n + h.items.filter(i => i.requestable && i.status !== 'NA').length, 0);
          const secTeam = includedHs.reduce((n, h) => n + h.items.filter(i => !i.requestable && i.status !== 'NA').length, 0);
          const isCollapsed = collSections[sec];

          return (
            <div key={sec} className="rounded-lg border border-tint overflow-hidden">
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

              {!isCollapsed && (
                <div className="divide-y divide-tint/40">
                  {hs.map(h => {
                    const on = h.items[0]?.headIncluded;
                    const cliCount = h.items.filter(i => i.requestable && i.status !== 'NA').length;
                    const teamCount = h.items.filter(i => !i.requestable && i.status !== 'NA').length;
                    const isOpen = openHead === h.headId;
                    const isAddingTask = addingTaskInHead === h.headId;

                    return (
                      <div key={h.headId}>
                        <div className={`flex items-center gap-2 px-3 py-2 ${!on ? 'opacity-50' : ''}`}>
                          {canEdit && (
                            <button
                              onClick={() => setHeadIncluded(h.headId, !on)}
                              className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 transition-colors ${on ? 'bg-green text-paper' : 'border border-tint bg-paper text-transparent'}`}
                              title={on ? 'Remove from scope' : 'Add to scope'}
                            >✓</button>
                          )}
                          <span className="flex-1 text-sm text-ink min-w-0 truncate">{h.sub}</span>
                          {on && (
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green/10 text-green font-medium tabular-nums">{cliCount} client</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-deep/10 text-deep font-medium tabular-nums">{teamCount} team</span>
                            </div>
                          )}
                          <button
                            onClick={() => setOpenHead(isOpen ? null : h.headId)}
                            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-ink px-2 py-1 rounded hover:bg-fog transition-colors shrink-0"
                          >
                            {h.items.length} tasks
                            <span className={`text-[9px] transition-transform duration-150 ${isOpen ? '' : '-rotate-90'}`}>▾</span>
                          </button>
                        </div>

                        {isOpen && (
                          <div className="border-t border-tint/40 bg-fog/20">
                            <div className="divide-y divide-tint/30">
                              {h.items.map(it => (
                                <div key={it.id} className="px-4 py-1.5 flex items-center gap-3">
                                  <span className="flex-1 text-xs min-w-0 text-ink">{it.p}</span>
                                  {canEdit && (
                                    <div className="flex rounded border border-tint overflow-hidden text-[10px] shrink-0" role="group">
                                      <button onClick={() => updateItem(it.id, { requestable: true })} className={`px-2.5 py-1 transition-colors ${it.requestable ? 'bg-green text-paper font-medium' : 'text-slate-500 hover:bg-fog'}`}>Client</button>
                                      <button onClick={() => updateItem(it.id, { requestable: false })} className={`px-2.5 py-1 border-l border-tint transition-colors ${!it.requestable ? 'bg-deep text-paper font-medium' : 'text-slate-500 hover:bg-fog'}`}>Team work</button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                            {canEdit && (
                              isAddingTask ? (
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
                              )
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {canEdit && (
                    addingSubInSection === sec ? (
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
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}

        {canEdit && (
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
        )}
      </div>
    </div>
  );
}
