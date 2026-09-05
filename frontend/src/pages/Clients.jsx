import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import Btn from '../components/Btn.jsx';
import Field, { SelectField } from '../components/Field.jsx';

const MODULES = ['audit', 'tax', 'corporate'];

function ClientModal({ client, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: client?.name || '',
    ntn: client?.ntn || '',
    address: client?.address || '',
    contactPerson: client?.contactPerson || '',
    contactEmail: client?.contactEmail || '',
    contactPhone: client?.contactPhone || '',
    module: client?.module || 'audit',
  });
  const [saving, setSaving] = useState(false);
  const up = k => v => setF(prev => ({ ...prev, [k]: v }));

  async function save() {
    if (!f.name.trim()) return;
    setSaving(true);
    try {
      if (client) {
        await api.clients.update(client.id, f);
        toast('Client updated', 'success');
      } else {
        await api.clients.create(f);
        toast(`${f.name} added`, 'success');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={client ? 'Edit client' : 'Add client'} onClose={onClose}>
      <Field label="Client name" value={f.name} onChange={up('name')} placeholder="Ehsan Chappal Store (Pvt) Ltd" required />
      <Field label="NTN" value={f.ntn} onChange={up('ntn')} placeholder="1234567-8" />
      <Field label="Address" value={f.address} onChange={up('address')} placeholder="Karachi" />
      <Field label="Contact person" value={f.contactPerson} onChange={up('contactPerson')} placeholder="Mr. Bilal" />
      <Field label="Contact email" value={f.contactEmail} onChange={up('contactEmail')} placeholder="bilal@example.com" />
      <Field label="Contact phone" value={f.contactPhone} onChange={up('contactPhone')} placeholder="0300 1234567" />
      <SelectField label="Module" value={f.module} onChange={up('module')}>
        {MODULES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
      </SelectField>
      <div className="flex justify-end gap-2 pt-1">
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving || !f.name.trim()}>
          {saving ? 'Saving…' : 'Save client'}
        </Btn>
      </div>
    </Modal>
  );
}

export default function Clients() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editClient, setEditClient] = useState(null);

  const canEdit = user?.role === 'partner' || user?.role === 'manager';

  async function load() {
    try {
      const data = await api.clients.list();
      setClients(data);
    } catch {} finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function deleteClient(c) {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try {
      await api.clients.delete(c.id);
      toast('Client deleted', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const filtered = clients.filter(c =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()) ||
    (c.ntn || '').includes(q)
  );

  return (
    <div className="stagger p-8 max-w-5xl">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Clients</h1>
          <div className="mt-3 h-px w-12 bg-green" />
          <p className="text-sm text-slate-500 mt-1">All clients across practice lines.</p>
        </div>
        {canEdit && (
          <Btn onClick={() => setShowAdd(true)}>Add client</Btn>
        )}
      </header>

      <div className="mb-4">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by name or NTN…"
          className="border border-tint bg-paper text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green w-72"
        />
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400">No clients found.</p>
      ) : (
        <div className="bg-paper border border-tint rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-tint bg-fog">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">NTN</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Contact</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Module</th>
                {canEdit && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr
                  key={c.id}
                  className="border-b border-tint last:border-0 hover:bg-fog transition-colors"
                >
                  <td
                    className="px-4 py-3 font-medium text-ink cursor-pointer hover:text-green transition-colors"
                    onClick={() => navigate(`/clients/${c.id}`)}
                  >{c.name}</td>
                  <td className="px-4 py-3 font-mono text-[13px] text-slate-500">{c.ntn || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 text-[13px]">
                    {c.contactPerson || '—'}
                    {c.contactPhone && <span className="text-slate-400"> · {c.contactPhone}</span>}
                  </td>
                  <td className="px-4 py-3 capitalize text-[13px] text-slate-500">{c.module || 'audit'}</td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditClient(c)}
                          className="text-xs text-slate-400 hover:text-ink transition-colors"
                        >Edit</button>
                        <button
                          onClick={() => deleteClient(c)}
                          className="text-xs text-slate-400 hover:text-deep transition-colors"
                        >Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <ClientModal onClose={() => setShowAdd(false)} onSaved={load} />
      )}
      {editClient && (
        <ClientModal client={editClient} onClose={() => setEditClient(null)} onSaved={load} />
      )}
    </div>
  );
}
