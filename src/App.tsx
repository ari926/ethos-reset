import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { useHealthStore } from './stores/healthStore';
import AppShell from './components/Layout/AppShell';
import LoginPage from './components/Auth/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BodyPage from './pages/BodyPage';
import ReportsPage from './pages/ReportsPage';
import RestrictionsPage from './pages/RestrictionsPage';
import ScannerPage from './pages/ScannerPage';
import WearablesPage from './pages/WearablesPage';
import ChatPage from './pages/ChatPage';
import DoctorsPage from './pages/DoctorsPage';
import FamilyPage from './pages/FamilyPage';
import InvitePage from './pages/InvitePage';

function AuthGate({ children }: { children: React.ReactNode }) {
  const session = useAuthStore(s => s.session);
  const loading = useAuthStore(s => s.loading);
  const initialized = useAuthStore(s => s.initialized);

  if (!initialized || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-tx-muted)' }}>
        Loading...
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return <>{children}</>;
}

export default function App() {
  const initialize = useAuthStore(s => s.initialize);
  const session = useAuthStore(s => s.session);
  const loadFamilyMembers = useHealthStore(s => s.loadFamilyMembers);

  useEffect(() => { initialize(); }, [initialize]);
  useEffect(() => { loadFamilyMembers(); }, [session, loadFamilyMembers]);

  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-surface)',
            color: 'var(--color-tx)',
            border: '1px solid var(--color-divider)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            fontSize: 'var(--text-sm)',
          },
        }}
      />
      <Routes>
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="*" element={
          <AuthGate>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/body" element={<BodyPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/restrictions" element={<RestrictionsPage />} />
                <Route path="/scanner" element={<ScannerPage />} />
                <Route path="/wearables" element={<WearablesPage />} />
                <Route path="/doctor-ai" element={<ChatPage />} />
                <Route path="/doctors" element={<DoctorsPage />} />
                <Route path="/family" element={<FamilyPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
          </AuthGate>
        } />
      </Routes>
    </BrowserRouter>
  );
}
