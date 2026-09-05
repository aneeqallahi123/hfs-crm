import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';

export default function Layout() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-paper text-ink flex">
      <Sidebar />
      <main className="flex-1 min-w-0 h-screen overflow-y-auto">
        <div key={location.pathname} className="view-fade">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
