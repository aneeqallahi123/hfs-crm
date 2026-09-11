import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Field, { SelectField } from '../components/Field.jsx';
import Btn from '../components/Btn.jsx';

const MODULES = ['audit', 'tax', 'consulting', 'misc'];
const EMPTY = { name: '', ntn: '', contactName: '', phone: '', waGroupId: '', module: 'audit' };

function ChevronIcon({ open }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 14 14" fill="none"
      className={`transition-transform duration-200 text-slate-400 ${open ? 'rotate-90' : ''}`}
    >
      <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-slate-400">
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function Clients() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editF, setEditF] = useState({});
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [search, setSearch] = useState('');

  const location = useLocation();
  const canEdit = user?.role === 'partner' || user?.role === 'manager';
  const up = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const upEdit = (k) => (v) => setEditF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (new URLSearchParams(location.search).get('add') === '1' && canEdit) setAdding(true);
  }, [location.search, canEdit]);

  async function load() {
    try {
      const [c, e] = await Promise.all([api.clients.list(), api.engagements.list()]);
      setClients(Array.isArray(c) ? c : []);
      setEngagements(Array.isArray(e) ? e : []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function validate() {
    const e = {};
    if (!f.name.trim()) e.name = 'Required';
    if (!f.ntn.trim()) e.ntn = 'Required';
    if (!f.contactName.trim()) e.contactName = 'Required';
    if (!f.module) e.module = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function add() {
    if (!validate()) return;
    try {
      const newClient = await api.clients.create({ ...f, name: f.name.trim() });
      toast(`${f.name.trim()} added`, 'success');
      setF(EMPTY);
      setErrors({});
      setAdding(false);
      navigate(`/clients/${newClient.id}`, { state: { openLibrary: true } });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function startEdit(c, e) {
    e.stopPropagation();
    setEditingId(c.id);
    setEditF({ name: c.name, ntn: c.ntn || '', contactName: c.contactName || '', phone: c.phone || '', waGroupId: c.waGroupId || '', module: c.module || 'audit' });
  }

  async function saveEdit(c, e) {
    e.stopPropagation();
    try {
      await api.clients.update(c.id, editF);
      setEditingId(null);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function cancelEdit(e) {
    e.stopPropagation();
    setEditingId(null);
  }

  async function remove(c, e) {
    e.stopPropagation();
    const n = engagements.filter((eng) => eng.clientId === c.id).length;
    if (!confirm(`Remove ${c.name}?${n ? ` This also removes ${n} year${n > 1 ? 's' : ''} of engagements and its documents.` : ''} This cannot be undone.`)) return;
    try { await api.clients.delete(c.id); toast('Client deleted', 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  }

  function toggleExpand(id, e) {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? clients.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.ntn || '').toLowerCase().includes(q) ||
        (c.contactName || '').toLowerCase().includes(q)
      )
    : clients;

  if (loading) return <div className="stagger p-8 max-w-4xl"><div className="text-sm text-slate-400">Loading…</div></div>;

  return (
    <div className="stagger p-8 max-w-4xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Clients</h1>
          <div className="mt-3 h-px w-12 bg-green" />
        </div>
        {canEdit && !adding && <Btn onClick={() => setAdding(true)}>Add client</Btn>}
      </header>

      {adding && (
        <div className="bg-paper border border-tint rounded-lg p-5 mb-6">
          <div className="grid md:grid-cols-2 gap-x-4">
            <div>
              <Field label="Client name *" value={f.name} onChange={up('name')} placeholder="Ehsan Chappal Store (Pvt) Ltd" />
              {errors.name && <p className="text-[11px] text-deep -mt-2 mb-2">{errors.name}</p>}
            </div>
            <div>
              <Field label="NTN *" value={f.ntn} onChange={up('ntn')} placeholder="1234567-8" />
              {errors.ntn && <p className="text-[11px] text-deep -mt-2 mb-2">{errors.ntn}</p>}
            </div>
            <div>
              <Field label="Contact person *" value={f.contactName} onChange={up('contactName')} placeholder="Mr. Bilal" />
              {errors.contactName && <p className="text-[11px] text-deep -mt-2 mb-2">{errors.contactName}</p>}
            </div>
            <Field label="WhatsApp number (optional)" value={f.phone} onChange={up('phone')} placeholder="0300 1234567" />
            <Field label="WhatsApp group ID (optional)" value={f.waGroupId} onChange={up('waGroupId')} placeholder="Group link or ID" />
            <div>
              <SelectField label="Module *" value={f.module} onChange={up('module')}>
                {MODULES.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </SelectField>
              {errors.module && <p className="text-[11px] text-deep -mt-2 mb-2">{errors.module}</p>}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mb-3">* Required fields</p>
          <div className="flex justify-end gap-2">
            <Btn kind="ghost" onClick={() => { setAdding(false); setErrors({}); setF(EMPTY); }}>Cancel</Btn>
            <Btn onClick={add}>Save client</Btn>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="mb-4 relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <SearchIcon />
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients by name, NTN, or contact…"
          className="w-full pl-9 pr-4 py-2.5 border border-tint rounded-lg bg-paper text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:border-green transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-ink transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        q ? (
          <div className="border border-dashed border-tint rounded-lg p-10 text-center">
            <p className="text-sm text-ink">No clients match "{search}".</p>
            <button onClick={() => setSearch('')} className="text-xs text-green hover:underline mt-1">Clear search</button>
          </div>
        ) : (
          <div className="border border-dashed border-tint rounded-lg p-10 text-center">
            <p className="text-sm text-ink">No clients yet.</p>
            <p className="text-xs text-slate-500 mt-1 mb-3">Add the first one, then start a year from the left panel.</p>
            {canEdit && !adding && <Btn onClick={() => setAdding(true)}>Add first client</Btn>}
          </div>
        )
      ) : (
        <div className="bg-paper border border-tint rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[11px] text-slate-500 border-b border-tint bg-fog/60">
                <th className="px-4 py-2.5 font-medium w-6" />
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">NTN</th>
                <th className="px-4 py-2.5 font-medium">Contact</th>
                <th className="px-4 py-2.5 font-medium">WhatsApp</th>
                <th className="px-4 py-2.5 font-medium text-right">Years</th>
                {canEdit && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const engs = engagements.filter((e) => e.clientId === c.id).sort((a, b) => b.year - a.year);
                const isEditing = editingId === c.id;
                const isExpanded = expandedIds.has(c.id);
                const hasYears = engs.length > 0;

                return (
                  <React.Fragment key={c.id}>
                    {/* Client row */}
                    <tr
                      className={`border-b border-tint/60 ${isEditing ? 'bg-fog/60' : 'hover:bg-fog/30 cursor-pointer'} transition-colors`}
                      onClick={() => !isEditing && navigate(`/clients/${c.id}`)}
                    >
                      {/* Expand toggle */}
                      <td className="pl-3 pr-1 py-3" onClick={(e) => { e.stopPropagation(); hasYears && toggleExpand(c.id, e); }}>
                        {hasYears && (
                          <button className="flex items-center justify-center w-5 h-5 rounded hover:bg-tint transition-colors">
                            <ChevronIcon open={isExpanded} />
                          </button>
                        )}
                      </td>

                      <td className="px-4 py-3" onClick={(e) => isEditing && e.stopPropagation()}>
                        {isEditing
                          ? <input value={editF.name} onChange={e => upEdit('name')(e.target.value)} className="w-full border border-tint rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-green" />
                          : (
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-ink">{c.name}</span>
                              {hasYears && (
                                <span className="text-[10px] font-mono bg-fog text-slate-500 px-1.5 py-0.5 rounded-full border border-tint">
                                  {engs.length}
                                </span>
                              )}
                            </div>
                          )}
                      </td>

                      <td className="px-4 py-3" onClick={(e) => isEditing && e.stopPropagation()}>
                        {isEditing
                          ? <input value={editF.ntn} onChange={e => upEdit('ntn')(e.target.value)} className="w-full border border-tint rounded px-2 py-1 text-sm text-slate-600 focus:outline-none focus:border-green" />
                          : <span className="text-slate-600 font-mono text-xs">{c.ntn || '—'}</span>}
                      </td>

                      <td className="px-4 py-3" onClick={(e) => isEditing && e.stopPropagation()}>
                        {isEditing
                          ? <input value={editF.contactName} onChange={e => upEdit('contactName')(e.target.value)} className="w-full border border-tint rounded px-2 py-1 text-sm text-slate-600 focus:outline-none focus:border-green" />
                          : <span className="text-slate-600">{c.contactName || '—'}</span>}
                      </td>

                      <td className="px-4 py-3" onClick={(e) => isEditing && e.stopPropagation()}>
                        {isEditing
                          ? <input value={editF.phone} onChange={e => upEdit('phone')(e.target.value)} className="w-full border border-tint rounded px-2 py-1 text-sm text-slate-600 font-mono focus:outline-none focus:border-green" />
                          : <span className="text-slate-500 font-mono text-xs">{c.phone || '—'}</span>}
                      </td>

                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {engs.length === 0
                          ? <span className="text-xs text-slate-300">none</span>
                          : (
                            <div className="flex flex-wrap gap-1 justify-end">
                              {engs.slice(0, 3).map((e) => (
                                <button
                                  key={e.id}
                                  onClick={() => navigate(`/engagements/${e.id}`)}
                                  className="text-[11px] font-mono text-green bg-green/10 hover:bg-green/20 px-1.5 py-0.5 rounded transition-colors"
                                >
                                  FY{e.year}
                                </button>
                              ))}
                              {engs.length > 3 && (
                                <span className="text-[11px] font-mono text-slate-400">+{engs.length - 3}</span>
                              )}
                            </div>
                          )}
                      </td>

                      {canEdit && (
                        <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {isEditing ? (
                            <span className="flex gap-2 justify-end">
                              <button onClick={(e) => saveEdit(c, e)} className="text-xs text-green hover:underline">Save</button>
                              <button onClick={cancelEdit} className="text-xs text-slate-400 hover:text-ink">Cancel</button>
                            </span>
                          ) : (
                            <span className="flex gap-2 justify-end opacity-0 group-hover:opacity-100">
                              <button onClick={(e) => startEdit(c, e)} className="text-xs text-slate-400 hover:text-ink transition-colors">Edit</button>
                              <button onClick={(e) => remove(c, e)} className="text-xs text-slate-400 hover:text-deep transition-colors">Remove</button>
                            </span>
                          )}
                        </td>
                      )}
                    </tr>

                    {/* Year sub-rows */}
                    {isExpanded && engs.map((eng, i) => (
                      <tr
                        key={eng.id}
                        className={`border-b border-tint/40 last:border-0 bg-fog/20 hover:bg-fog/50 cursor-pointer transition-colors`}
                        onClick={() => navigate(`/engagements/${eng.id}`)}
                      >
                        <td className="pl-3 pr-1 py-2">
                          {/* indent line */}
                          <div className="ml-2 w-px h-full" />
                        </td>
                        <td className="px-4 py-2" colSpan={1}>
                          <div className="flex items-center gap-2 pl-4">
                            <div className="w-px h-4 bg-tint" />
                            <span className="font-mono text-xs font-semibold text-green">FY{eng.year}</span>
                            {eng.module && (
                              <span className="text-[10px] text-slate-400 capitalize bg-fog border border-tint px-1.5 py-0.5 rounded">
                                {eng.module}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-400" colSpan={3}>
                          {eng.status && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full border
                              ${eng.status === 'complete' ? 'text-green border-green/30 bg-green/5'
                                : eng.status === 'in_progress' ? 'text-amber-600 border-amber-200 bg-amber-50'
                                : 'text-slate-400 border-tint bg-fog'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full inline-block
                                ${eng.status === 'complete' ? 'bg-green'
                                  : eng.status === 'in_progress' ? 'bg-amber-400'
                                  : 'bg-slate-300'}`} />
                              {eng.status.replace('_', ' ')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="text-[11px] text-slate-400 hover:text-green transition-colors">View →</span>
                        </td>
                        {canEdit && <td />}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-tint/60 bg-fog/30">
              <span className="text-[11px] text-slate-400 font-mono">
                {filtered.length} client{filtered.length !== 1 ? 's' : ''}
                {q && ` matching "${search}"`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
