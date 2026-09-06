import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import Modal from './Modal.jsx';
import Btn from './Btn.jsx';
import Field, { SelectField } from './Field.jsx';

const MODULES = ['audit', 'tax', 'consulting', 'misc'];

function NewClientModal({ onClose, onSaved }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', ntn: '', contactName: '', phone: '', module: 'audit' });
  const [saving, setSaving] = useState(false);
  const up = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.name.trim()) return;
    setSaving(true);
    try {
      const client = await api.clients.create({ ...f, name: f.name.trim() });
      toast(`${f.name.trim()} added`, 'success');
      onSaved();
      onClose();
      navigate(`/clients/${client.id}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add client" onClose={onClose}>
      <Field label="Client name" value={f.name} onChange={up('name')} placeholder="Ehsan Chappal Store (Pvt) Ltd" />
      <Field label="NTN" value={f.ntn} onChange={up('ntn')} placeholder="1234567-8" />
      <Field label="Contact person" value={f.contactName} onChange={up('contactName')} placeholder="Mr. Bilal" />
      <Field label="WhatsApp number" value={f.phone} onChange={up('phone')} placeholder="0300 1234567" />
      <SelectField label="Module" value={f.module} onChange={up('module')}>
        {MODULES.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
      </SelectField>
      <div className="flex justify-end gap-2 pt-1">
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving || !f.name.trim()}>{saving ? 'Saving…' : 'Save client'}</Btn>
      </div>
    </Modal>
  );
}

function NewEngagementButton({ client, engagements, onCreated }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const mine = engagements.filter((e) => e.clientId === client.id).sort((a, b) => b.year - a.year);
  const prior = mine[0];
  const suggested = prior ? prior.year + 1 : new Date().getFullYear();
  const [year, setYear] = useState(suggested);
  const taken = mine.some((e) => e.year === Number(year));
  const validYear = Number.isInteger(Number(year)) && Number(year) > 1990 && Number(year) < 2100 && !taken;

  async function create(mode) {
    if (!validYear) return;
    try {
      const eng = mode === 'rollforward' && prior
        ? await api.engagements.rollForward(prior.id)
        : await api.engagements.create({ clientId: client.id, module: client.module || 'audit', year: Number(year), incharge: '', deadline: '' });
      toast(`FY ${eng.year} started for ${client.name}`, 'success');
      setOpen(false);
      onCreated();
      navigate(`/engagements/${eng.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="pl-8 pr-2 mb-1">
      <button onClick={() => { setYear(suggested); setOpen(!open); }} className="text-[11px] text-paper/50 hover:text-paper transition-colors">New engagement year</button>
      {open && (
        <div className="mt-1 mb-2 rounded-md p-1.5 bg-paper/10 border border-paper/10">
          <label className="flex items-center gap-2 px-2 py-1 text-[11px] text-paper/70">
            FY
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} min="1991" max="2099" className="w-20 bg-paper/10 text-paper font-mono text-xs rounded px-1.5 py-0.5 border border-paper/15 focus:outline-none focus:border-green" />
            {taken && <span className="text-paper/60">already exists</span>}
          </label>
          {prior ? (
            <>
              <button onClick={() => create('rollforward')} disabled={!validYear} className="block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-paper/10 text-paper disabled:opacity-40">
                <span className="font-medium">Roll forward FY {prior.year}</span>
                <span className="block text-paper/55 text-[11px]">Same scope and owners, fresh statuses</span>
              </button>
              <button onClick={() => create('fresh')} disabled={!validYear} className="block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-paper/10 text-paper mt-0.5 disabled:opacity-40">
                <span className="font-medium">Start fresh</span>
                <span className="block text-paper/55 text-[11px]">Scope from the master library</span>
              </button>
            </>
          ) : (
            <button onClick={() => create('fresh')} disabled={!validYear} className="block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-paper/10 text-paper disabled:opacity-40">
              <span className="font-medium">Start engagement</span>
              <span className="block text-paper/55 text-[11px]">Scope from the master library</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [clients, setClients] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [q, setQ] = useState('');
  const [openC, setOpenC] = useState({});
  const [showNewClient, setShowNewClient] = useState(false);

  function load() {
    if (!user) return;
    api.clients.list().then((c) => setClients(Array.isArray(c) ? c : [])).catch(() => {});
    if (user.role !== 'student') {
      api.engagements.list().then((e) => setEngagements(Array.isArray(e) ? e : [])).catch(() => {});
    }
  }

  useEffect(() => { load(); }, [user]);

  const isStudent = user?.role === 'student';
  const isPartner = user?.role === 'partner';
  const isPartnerOrManager = user?.role === 'partner' || user?.role === 'manager';

  const NAV = [
    { path: '/', label: 'Overview', hint: 'Where every client stands' },
    { path: '/tasks', label: 'Tasks', hint: isStudent ? 'Everything open in your name' : 'Every open task, by person' },
    ...(isPartner ? [{ path: '/team', label: 'Team', hint: "Who's carrying what" }] : []),
    ...(!isStudent ? [{ path: '/events', label: 'Activity', hint: 'Who changed what, and when' }] : []),
    ...(!isStudent ? [{ path: '/clients', label: 'Clients', hint: 'Add, edit or remove clients' }] : []),
    ...(isPartnerOrManager ? [{ path: '/library', label: 'Library', hint: 'The master request list' }] : []),
  ];

  const filtered = clients.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));

  function isActive(path) {
    return path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <aside className="w-72 shrink-0 text-paper h-screen overflow-y-auto flex flex-col" aria-label="Navigation">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-paper/10 border border-paper/15 flex items-center justify-center shrink-0">
            <span className="font-serif text-paper text-base font-semibold leading-none">HF</span>
          </div>
          <div className="leading-tight">
            <div className="font-serif text-paper text-[17px] font-semibold">Hassan Farooq &amp; Co.</div>
            <div className="text-[11px] text-paper/55 mt-0.5">Chartered accountants</div>
          </div>
        </div>
        {user && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] text-paper/55">{user.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-paper/15 text-paper/80 capitalize">{user.role}</span>
          </div>
        )}
      </div>

      <nav className="px-3 pb-3" aria-label="Primary">
        {NAV.map(({ path, label, hint }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              aria-current={active ? 'page' : undefined}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors mb-0.5 border-l-2 ${active ? 'bg-paper/10 border-green' : 'border-transparent hover:bg-paper/5'}`}
            >
              <span className={`block text-sm ${active ? 'text-paper font-medium' : 'text-paper/85'}`}>{label}</span>
              <span className="block text-[11px] text-paper/45">{hint}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-3 pt-4 border-t border-paper/10">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[11px] text-paper/55">Clients</span>
          {!isStudent && (
            <button onClick={() => setShowNewClient(true)} title="Add client" aria-label="Add client" className="h-6 px-2 rounded-md text-[11px] text-paper/80 bg-paper/10 hover:bg-paper/20">Add</button>
          )}
        </div>
        {clients.length > 6 && (
          <div className="px-2 mb-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a client" aria-label="Find a client" className="w-full bg-paper/10 text-paper placeholder-paper/40 text-xs rounded-md px-2.5 py-1.5 border border-paper/10 focus:outline-none focus:bg-paper/15" />
          </div>
        )}
      </div>

      <div className="flex-1 px-3 pb-6">
        {clients.length === 0 && <p className="px-2 py-2 text-xs text-paper/50">No clients yet. Use Add to create the first one.</p>}
        {filtered.map((c) => {
          const engs = engagements.filter((e) => e.clientId === c.id).sort((a, b) => b.year - a.year);
          const isClientActive = engs.some((e) => location.pathname === `/engagements/${e.id}`);
          const expanded = openC[c.id] ?? isClientActive;
          return (
            <div key={c.id} className="mb-0.5">
              <button
                onClick={() => setOpenC((o) => ({ ...o, [c.id]: !expanded }))}
                aria-expanded={expanded}
                className={`w-full px-3 py-1.5 flex items-center gap-2 rounded-md text-left transition-colors ${isClientActive ? 'text-paper' : 'text-paper/85 hover:bg-paper/5'}`}
              >
                <span className="text-[10px] text-paper/40 w-3">{expanded ? '▾' : '▸'}</span>
                <span className="text-[13px] truncate flex-1">{c.name}</span>
              </button>
              {expanded && (
                <div className="mb-1">
                  {isStudent ? (
                    <button onClick={() => navigate(`/clients/${c.id}`)} className="w-full text-left pl-8 pr-3 py-1.5 text-xs rounded-md transition-colors border-l-2 text-paper/70 hover:bg-paper/5 hover:text-paper border-transparent">
                      View engagements
                    </button>
                  ) : (
                    <>
                      {engs.length === 0 && <p className="pl-8 py-1 text-[11px] text-paper/40">No year yet</p>}
                      {engs.map((e) => {
                        const on = location.pathname === `/engagements/${e.id}`;
                        return (
                          <button key={e.id} onClick={() => navigate(`/engagements/${e.id}`)} className={`w-full text-left pl-8 pr-3 py-1.5 text-xs rounded-md transition-colors border-l-2 ${on ? 'bg-paper/10 text-paper border-green' : 'text-paper/60 hover:bg-paper/5 hover:text-paper border-transparent'}`}>
                            FY {e.year}
                          </button>
                        );
                      })}
                      <NewEngagementButton client={c} engagements={engagements} onCreated={load} />
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-5 pb-5 pt-3 border-t border-paper/10">
        <button onClick={handleLogout} className="text-[11px] text-paper/55 hover:text-paper/90 transition-colors">Sign out</button>
      </div>

      {showNewClient && <NewClientModal onClose={() => setShowNewClient(false)} onSaved={load} />}
    </aside>
  );
}
