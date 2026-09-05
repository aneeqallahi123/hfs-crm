import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import EditableText from '../components/EditableText.jsx';
import Field, { SelectField } from '../components/Field.jsx';
import Btn from '../components/Btn.jsx';

const MODULES = ['audit', 'tax', 'consulting', 'misc'];

const EMPTY = { name: '', ntn: '', contactName: '', phone: '', waGroupId: '', module: 'audit' };

function required(f) {
  return !f.name.trim() || !f.ntn.trim() || !f.contactName.trim() || !f.module;
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

  const canEdit = user?.role === 'partner' || user?.role === 'manager';
  const up = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

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

  async function update(c, patch) {
    try { await api.clients.update(c.id, patch); load(); } catch (err) { toast(err.message, 'error'); }
  }

  async function remove(c) {
    const n = engagements.filter((e) => e.clientId === c.id).length;
    if (!confirm(`Remove ${c.name}?${n ? ` This also removes ${n} year${n > 1 ? 's' : ''} of engagements and its documents.` : ''} This cannot be undone.`)) return;
    try { await api.clients.delete(c.id); toast('Client deleted', 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  }

  if (loading) return <div className="stagger p-8 max-w-4xl"><div className="text-sm text-slate-400">Loading…</div></div>;

  return (
    <div className="stagger p-8 max-w-4xl">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Clients</h1>
          <div className="mt-3 h-px w-12 bg-green" />
          <p className="text-sm text-slate-500 mt-3">Each year of work hangs off its client. Click a name to view details.</p>
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

      {clients.length === 0 ? (
        <div className="border border-dashed border-tint rounded-lg p-10 text-center">
          <p className="text-sm text-ink">No clients yet.</p>
          <p className="text-xs text-slate-500 mt-1 mb-3">Add the first one, then start a year from the left panel.</p>
          {canEdit && !adding && <Btn onClick={() => setAdding(true)}>Add first client</Btn>}
        </div>
      ) : (
        <div className="bg-paper border border-tint rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[11px] text-slate-500 border-b border-tint bg-fog/60">
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">NTN</th>
                <th className="px-4 py-2.5 font-medium">Contact</th>
                <th className="px-4 py-2.5 font-medium">WhatsApp</th>
                <th className="px-4 py-2.5 font-medium">WA Group</th>
                <th className="px-4 py-2.5 font-medium text-right">Years</th>
                {canEdit && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const engs = engagements.filter((e) => e.clientId === c.id).sort((a, b) => b.year - a.year);
                return (
                  <tr key={c.id} className="border-b border-tint/60 last:border-0 hover:bg-fog/40 cursor-pointer" onClick={() => navigate(`/clients/${c.id}`)}>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <EditableText value={c.name} onSave={(v) => v.trim() && update(c, { name: v.trim() })} className="text-ink font-medium w-full" />
                      ) : <span className="px-1.5 py-0.5 text-ink font-medium">{c.name}</span>}
                    </td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      {canEdit ? <EditableText value={c.ntn || ''} onSave={(v) => update(c, { ntn: v })} placeholder="—" className="text-slate-600 w-full" />
                        : <span className="px-1.5 py-0.5 text-slate-600">{c.ntn || '—'}</span>}
                    </td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      {canEdit ? <EditableText value={c.contactName || ''} onSave={(v) => update(c, { contactName: v })} placeholder="—" className="text-slate-600 w-full" />
                        : <span className="px-1.5 py-0.5 text-slate-600">{c.contactName || '—'}</span>}
                    </td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      {canEdit ? <EditableText value={c.phone || ''} onSave={(v) => update(c, { phone: v })} placeholder="—" className="text-slate-600 w-full font-mono" />
                        : <span className="px-1.5 py-0.5 text-slate-600 font-mono">{c.phone || '—'}</span>}
                    </td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      {canEdit ? <EditableText value={c.waGroupId || ''} onSave={(v) => update(c, { waGroupId: v })} placeholder="—" className="text-slate-600 w-full" />
                        : <span className="px-1.5 py-0.5 text-slate-600">{c.waGroupId || '—'}</span>}
                    </td>
                    <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {engs.length === 0 ? <span className="text-xs text-slate-400">none</span> :
                        engs.map((e) => (
                          <button key={e.id} onClick={() => navigate(`/engagements/${e.id}`)} className="ml-1 text-xs text-green hover:underline underline-offset-2">FY{e.year}</button>
                        ))}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => remove(c)} className="text-xs text-slate-400 hover:text-deep">Remove</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
