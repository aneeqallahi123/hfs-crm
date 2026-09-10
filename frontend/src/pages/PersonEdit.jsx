import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

const ROLE_OPTIONS = ['partner', 'manager', 'student'];

export default function PersonEdit() {
  const { name } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('student');
  const [editUsername, setEditUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const team = await api.team.list();
        const p = (Array.isArray(team) ? team : []).find((p) => p.name === name) || null;
        setPerson(p);
        if (p) {
          setEditName(p.name);
          setEditRole(p.role || 'student');
          setEditUsername(p.username || '');
        }
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [name]);

  async function save() {
    if (!person || !editName.trim()) return;
    const updates = {};
    if (editName.trim() !== person.name) updates.name = editName.trim();
    if (editRole !== person.role) updates.role = editRole;
    if (editUsername.trim() && editUsername.trim() !== person.username) updates.username = editUsername.trim().toLowerCase();
    if (editPassword && currentPassword) { updates.password = editPassword; updates.currentPassword = currentPassword; }
    if (!Object.keys(updates).length) { navigate(`/team/${encodeURIComponent(name)}`); return; }
    setSaving(true);
    try {
      await api.team.update(person.id, updates);
      toast('Profile updated', 'success');
      navigate(`/team/${encodeURIComponent(updates.name || name)}`);
    } catch (err) {
      toast(err.message, 'error');
      setSaving(false);
    }
  }

  async function removePerson() {
    if (!person) return;
    try {
      await api.team.deactivate(person.id);
      toast(`${person.name} removed from the team`, 'info');
      navigate('/team');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (loading) return <div className="stagger p-8 max-w-lg"><div className="text-sm text-slate-400">Loading…</div></div>;
  if (!person) return <div className="stagger p-8 max-w-lg"><div className="text-sm text-slate-400">Person not found.</div></div>;

  const initials = person.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="stagger p-8 max-w-lg">
      {/* Confirm Remove */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-paper border border-tint rounded-xl p-6 shadow-lg max-w-sm w-full mx-4">
            <h2 className="text-base font-semibold text-ink mb-1">Remove {person.name}?</h2>
            <p className="text-sm text-slate-500 mb-5">This will remove them from the team. Their past work will remain intact.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmRemove(false)} className="text-sm px-4 py-2 rounded-md font-medium text-ink bg-paper hover:bg-fog border border-tint transition-colors">Cancel</button>
              <button onClick={removePerson} className="text-sm px-4 py-2 rounded-md font-medium text-paper bg-red-500 hover:bg-red-600 transition-colors">Remove</button>
            </div>
          </div>
        </div>
      )}

      <button onClick={() => navigate(`/team/${encodeURIComponent(name)}`)} className="text-xs text-slate-400 hover:text-ink mb-6">← Back to {name.split(' ')[0]}</button>

      {/* Avatar + name preview */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full border border-tint text-ink flex items-center justify-center text-lg font-medium shrink-0">
          {initials}
        </div>
        <div>
          <div className="font-serif text-2xl font-medium text-ink">{editName || person.name}</div>
          <div className="text-sm text-slate-400 capitalize mt-0.5">{editRole}</div>
        </div>
      </div>

      {/* Form */}
      <div className="bg-paper border border-tint rounded-xl p-6 flex flex-col gap-5 mb-5">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Name</label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full border border-tint rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Role</label>
          <select
            value={editRole}
            onChange={(e) => setEditRole(e.target.value)}
            className="w-full border border-tint rounded-lg px-3 py-2.5 text-sm bg-paper focus:outline-none focus:border-green transition-colors appearance-none"
          >
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
        </div>

        <div className="h-px bg-tint" />

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Username</label>
          <input
            value={editUsername}
            onChange={(e) => setEditUsername(e.target.value)}
            className="w-full border border-tint rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-green transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Current password</label>
          <div className="relative">
            <input
              type={showCurrentPw ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full border border-tint rounded-lg px-3 py-2.5 pr-16 text-sm focus:outline-none focus:border-green transition-colors"
            />
            <button type="button" onClick={() => setShowCurrentPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-ink transition-colors">
              {showCurrentPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">
            New password <span className="font-normal text-slate-400">(enter current password first)</span>
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              placeholder="Enter new password"
              disabled={!currentPassword}
              className="w-full border border-tint rounded-lg px-3 py-2.5 pr-16 text-sm focus:outline-none focus:border-green transition-colors disabled:opacity-40"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              disabled={!currentPassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-ink transition-colors disabled:opacity-40"
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setConfirmRemove(true)}
          className="text-sm font-medium text-red-500 hover:text-red-600 transition-colors"
        >
          Remove from team
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/team/${encodeURIComponent(name)}`)}
            className="text-sm px-4 py-2 rounded-lg font-medium text-ink bg-paper hover:bg-fog border border-tint transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !editName.trim()}
            className="text-sm px-5 py-2 rounded-lg font-medium bg-green text-paper hover:bg-deep disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
