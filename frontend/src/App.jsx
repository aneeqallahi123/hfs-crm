import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import ClientDetail from './pages/ClientDetail.jsx';
import EngagementDetail from './pages/EngagementDetail.jsx';
import Team from './pages/Team.jsx';
import Person from './pages/Person.jsx';
import Tasks from './pages/Tasks.jsx';
import Events from './pages/Events.jsx';
import Library from './pages/Library.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-fog">
      <div className="text-sm text-slate-400">Loading…</div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="engagements/:id" element={<EngagementDetail />} />
        <Route
          path="team"
          element={
            <RequireRole roles={['partner']}>
              <Team />
            </RequireRole>
          }
        />
        <Route
          path="team/:name"
          element={
            <RequireRole roles={['partner']}>
              <Person />
            </RequireRole>
          }
        />
        <Route
          path="events"
          element={
            <RequireRole roles={['partner', 'manager']}>
              <Events />
            </RequireRole>
          }
        />
        <Route
          path="library"
          element={
            <RequireRole roles={['partner', 'manager']}>
              <Library />
            </RequireRole>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
