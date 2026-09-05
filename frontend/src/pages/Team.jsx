import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import Btn from '../components/Btn.jsx';
import Field, { SelectField } from '../components/Field.jsx';

const ROLES = ['partner', 'manager', 'student'];

function UserModal({ member, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: member?.name || '',
    username: member?.username || '',
    password: '',
    role: member?.role || 'student',
  });
  const [saving, setSaving] = useState(false);
  const up = k => v => setF(p => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      if (member) {
        const data = { name: f.name, role: f.role };
        if (f.password) data.password = f.password;
        await api.team.update(member.id, data);
        toast('Member updated', 'success');
      } else {
        await api.team.create(f);
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
    <Modal title={member ? 'Edit member' : 'Add team member'} onClose={onClose}>
      <Field label="Full name" value={f.name} onChange={up('name')} placeholder="Ahmed Khan" required />
      {!member && (
        <Field label="Username" value={f.username} onChange={up('username')} placeholder="ahmed.khan" required />
      )}
      <Field label={member ? 'New password (leave blank to keep)' : 'Password'} value={f.password} onChange={up('password')} type="password" required={!member} />
      <SelectField label="Role" value={f.role} onChange={up('role')}>
        {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
      </SelectField>
      <div className="flex justify-end gap-2 pt-1">
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving || !f.name.trim() || (!member && (!f.username.trim() || !f.password))}>
          {saving ? 'Saving…' : 'Save'}
        </Btn>
      </div>
    </Modal>
  );
}

export default function Team() {
  const toast = useToast();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editMember, setEditMember] = useState(null);

  async function load() {
    try {
      const data = await api.team.list();
      setMembers(data);
    } catch {} finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function deactivate(m) {
    if (!confirm(`Deactivate ${m.name}?`)) return;
    try {
      await api.team.deactivate(m.id);
      toast(`${m.name} deactivated`, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const active = members.filter(m => m.active !== false);
  const inactive = members.filter(m => m.active === false);

  return (
    <div className="stagger p-8 max-w-3xl">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-[32px] leading-[1.15] font-medium text-ink tracking-[-0.01em]">Team</h1>
          <div className="mt-3 h-px w-12 bg-green" />
          <p className="text-sm text-slate-500 mt-1">Manage team members and their access.</p>
        </div>
        <Btn onClick={() => setShowAdd(true)}>Add member</Btn>
      </header>

      {loading ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          <div className="bg-paper border border-tint rounded-lg overflow-hidden mb-6">
            {active.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-400 text-center">No active members.</div>
            ) : active.map(m => (
              <div key={m.id} className="flex items-center gap-4 px-4 py-3.5 border-b border-tint last:border-0 hover:bg-fog transition-colors">
                <div className="w-9 h-9 rounded-full bg-deep/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-medium text-deep">{m.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink">{m.name}</div>
                  <div className="text-xs text-slate-500">{m.username} · <span className="capitalize">{m.role}</span></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditMember(m)} className="text-xs text-slate-400 hover:text-ink">Edit</button>
                  <button onClick={() => deactivate(m)} className="text-xs text-slate-400 hover:text-deep">Deactivate</button>
                </div>
              </div>
            ))}
          </div>

          {inactive.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Inactive</h2>
              <div className="bg-paper border border-tint rounded-lg overflow-hidden opacity-60">
                {inactive.map(m => (
                  <div key={m.id} className="flex items-center gap-4 px-4 py-3 border-b border-tint last:border-0">
                    <div className="w-8 h-8 rounded-full bg-fog flex items-center justify-center shrink-0">
                      <span className="text-sm text-slate-400">{m.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-500">{m.name}</div>
                      <div className="text-xs text-slate-400">{m.username} · <span className="capitalize">{m.role}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showAdd && <UserModal onClose={() => setShowAdd(false)} onSaved={load} />}
      {editMember && <UserModal member={editMember} onClose={() => setEditMember(null)} onSaved={load} />}
    </div>
  );
}
