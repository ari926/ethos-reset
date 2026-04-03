import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppShell() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('health-theme') as 'light' | 'dark') || 'light';
  });
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('health-sidebar') === 'collapsed';
  });

  useEffect(() => {
    localStorage.setItem('health-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('health-sidebar', collapsed ? 'collapsed' : 'open');
  }, [collapsed]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');
  const toggleSidebar = () => setCollapsed(c => !c);

  return (
    <div data-theme={theme}>
      <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
        <Header theme={theme} onToggleTheme={toggleTheme} />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
