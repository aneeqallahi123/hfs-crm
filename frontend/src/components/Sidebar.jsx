import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [openClients, setOpenClients] = useState({});

  useEffect(() => {
    if (user) api.clients.list().then(setClients).catch(() => {});
  }, [user]);

  const isStudent = user?.role === 'student';
  const isPartner = user?.role === 'partner';

  const isPartnerOrManager = user?.role === 'partner' || user?.role === 'manager';

  const NAV = [
    { path: '/', label: 'Overview', hint: 'Where every client stands' },
    ...(!isStudent ? [{ path: '/clients', label: 'Clients', hint: 'Add, edit or remove clients' }] : []),
    ...(isPartner ? [{ path: '/team', label: 'Team', hint: 'Manage team members' }] : []),
    ...(isPartnerOrManager ? [{ path: '/library', label: 'Library', hint: 'Master checklist template' }] : []),
    ...(!isStudent ? [{ path: '/events', label: 'Activity', hint: 'Who changed what, and when' }] : []),
  ];

  const filtered = clients.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()));

  function isActive(path) {
    return location.pathname === path;
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <aside className="w-72 shrink-0 text-paper h-screen overflow-y-auto flex flex-col" aria-label="Navigation">
      {/* Brand */}
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

      {/* Nav */}
      <nav className="px-3 pb-3" aria-label="Primary">
        {NAV.map(({ path, label, hint }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              aria-current={active ? 'page' : undefined}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors mb-0.5 border-l-2 ${
                active ? 'bg-paper/10 border-green' : 'border-transparent hover:bg-paper/5'
              }`}
            >
              <span className={`block text-sm ${active ? 'text-paper font-medium' : 'text-paper/85'}`}>{label}</span>
              <span className="block text-[11px] text-paper/45">{hint}</span>
            </button>
          );
        })}
      </nav>

      {/* Clients list */}
      <div className="px-3 pt-4 border-t border-paper/10">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[11px] text-paper/55">Clients</span>
          {!isStudent && (
            <button
              onClick={() => navigate('/clients')}
              className="h-6 px-2 rounded-md text-[11px] text-paper/80 bg-paper/10 hover:bg-paper/20"
            >Add</button>
          )}
        </div>
        {clients.length > 6 && (
          <div className="px-2 mb-2">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Find a client"
              className="w-full bg-paper/10 text-paper placeholder-paper/40 text-xs rounded-md px-2.5 py-1.5 border border-paper/10 focus:outline-none focus:bg-paper/15"
            />
          </div>
        )}
      </div>

      <div className="flex-1 px-3 pb-4">
        {filtered.length === 0 && (
          <p className="px-2 py-2 text-xs text-paper/50">No clients yet.</p>
        )}
        {filtered.map(c => {
          const expanded = openClients[c.id] ?? false;
          const isClientActive = location.pathname.startsWith(`/clients/${c.id}`);
          return (
            <div key={c.id} className="mb-0.5">
              <button
                onClick={() => setOpenClients(o => ({ ...o, [c.id]: !expanded }))}
                className={`w-full px-3 py-1.5 flex items-center gap-2 rounded-md text-left transition-colors ${
                  isClientActive ? 'text-paper' : 'text-paper/85 hover:bg-paper/5'
                }`}
              >
                <span className="text-[10px] text-paper/40 w-3">{expanded ? '▾' : '▸'}</span>
                <span className="text-[13px] truncate flex-1">{c.name}</span>
              </button>
              {expanded && (
                <div className="mb-1">
                  <button
                    onClick={() => navigate(`/clients/${c.id}`)}
                    className="w-full text-left pl-8 pr-3 py-1.5 text-xs rounded-md transition-colors border-l-2 text-paper/70 hover:bg-paper/5 hover:text-paper border-transparent"
                  >
                    View engagements
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Logout */}
      <div className="px-5 pb-5 pt-3 border-t border-paper/10">
        <button
          onClick={handleLogout}
          className="text-[11px] text-paper/55 hover:text-paper/90 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
