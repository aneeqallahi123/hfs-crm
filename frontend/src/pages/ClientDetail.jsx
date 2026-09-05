import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import Btn from '../components/Btn.jsx';
import Field, { SelectField } from '../components/Field.jsx';

const MODULES = ['audit', 'tax', 'corporate'];

function NewEngagementModal({ client, engagements, onClose, onSaved }) {
  const toast = useToast();
  const navigate = useNavigate();
  const latestYear = engagements.length ? Math.max(...engagements.map(e => e.year)) : new Date().getFullYear() - 1;
  const [f, setF] = useState({
    title: `Audit FY ${latestYear + 1}`,
    year: latestYear + 1,
    module: client.module || 'audit',
    incharge: '',
    dueDate: '',
    isAdhoc: false,
  });
  const [saving, setSaving] = useState(false);
  const up = k => v => setF(p => ({ ...p, [k]: v }));

  const yearTaken = engagements.some(e => e.year === Number(f.year));

  async function save() {
    setSaving(true);
    try {
      const eng = await api.engagements.create({ ...f, clientId: client.id, year: Number(f.year) });
      toast(`Engagement created`, 'success');
      onSaved();
      onClose();
      navigate(`/engagements/${eng.id}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New engagement" onClose={onClose}>
      <Field label="Title" value={f.title} onChange={up('title')} placeholder="Audit FY 2025" required />
      <Field label="Year" value={String(f.year)} onChange={v => up('year')(Number(v))} type="number" />
      {yearTaken && <p className="text-xs text-deep -mt-2 mb-3">A FY {f.year} engagement already exists for this client.</p>}
      <SelectField label="Module" value={f.module} onChange={up('module')}>
        {MODULES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
      </SelectField>
      <Field label="In-charge" value={f.incharge} onChange={up('incharge')} placeholder="Team member name" />
      <Field label="Due date" value={f.dueDate} onChange={up('dueDate')} type="date" />
      <div className="flex justify-end gap-2 pt-1">
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving || yearTaken || !f.title.trim()}>
          {saving ? 'Creating…' : 'Create engagement'}
        </Btn>
      </div>
    </Modal>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [client, setClient] = useState(null);
  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const canEdit = user?.role === 'partner' || user?.role === 'manager';
  const today = new Date().toISOString().split('T')[0];

  async function load() {
    try {
      const [c, engs] = await Promise.all([
        api.clients.get(id),
        api.engagements.list(id),
      ]);
      setClient(c);
      setEngagements(engs.sort((a, b) => b.year - a.year));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  function statusColor(e) {
    if (e.status === 'Completed') return 'bg-fog text-green border-tint';
    if (e.dueDate && e.dueDate < today) return 'bg-rose-50 text-deep border-rose-200';
    return 'bg-fog text-slate-500 border-tint';
  }

  if (loading) return <div className="p-8 text-sm text-slate-400">Loading…</div>;
  if (!client) return <div className="p-8 text-sm text-deep">Client not found.</div>;

  return (
    <div className="stagger p-8 max-w-5xl">
      <button onClick={() => navigate('/clients')} className="text-xs text-slate-400 hover:text-ink mb-4 flex items-center gap-1">
        ← Clients
      </button>

      <header className="mb-8">
        <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">
          {client.name}
        </h1>
        <div className="mt-3 h-px w-12 bg-green" />
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
          {client.ntn && <span>NTN: <span className="font-mono text-ink">{client.ntn}</span></span>}
          {client.contactPerson && <span>Contact: {client.contactPerson}</span>}
          {client.contactPhone && <span>{client.contactPhone}</span>}
          {client.contactEmail && <span>{client.contactEmail}</span>}
        </div>
      </header>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide text-[11px]">
          Engagements ({engagements.length})
        </h2>
        {canEdit && (
          <Btn size="sm" onClick={() => setShowNew(true)}>New engagement</Btn>
        )}
      </div>

      {engagements.length === 0 ? (
        <p className="text-sm text-slate-400">No engagements yet. Create one to get started.</p>
      ) : (
        <div className="space-y-3">
          {engagements.map(e => (
            <div
              key={e.id}
              onClick={() => navigate(`/engagements/${e.id}`)}
              className="bg-paper border border-tint rounded-lg px-5 py-4 cursor-pointer hover:border-green transition-colors flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-ink text-sm">{e.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  FY {e.year}
                  {e.incharge && <span> · {e.incharge}</span>}
                  {e.dueDate && <span> · Due {e.dueDate}</span>}
                </div>
              </div>
              <span className={`text-[11px] px-2.5 py-1 rounded-full border ${statusColor(e)}`}>
                {e.status === 'Completed' ? 'Complete' : e.dueDate && e.dueDate < today ? 'Overdue' : e.status || 'In progress'}
              </span>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <NewEngagementModal
          client={client}
          engagements={engagements}
          onClose={() => setShowNew(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
