import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  FileText,
  ShieldAlert,
  Camera,
  Watch,
  MessageCircle,
  Stethoscope,
  Users,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Heart,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/body', icon: Activity, label: '3D Body' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/restrictions', icon: ShieldAlert, label: 'Restrictions' },
  { to: '/scanner', icon: Camera, label: 'Scanner' },
  { to: '/wearables', icon: Watch, label: 'Wearables' },
  { to: '/chat', icon: MessageCircle, label: 'AI Chat' },
  { to: '/doctors', icon: Stethoscope, label: 'Doctors' },
  { to: '/family', icon: Users, label: 'Family' },
];

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { user, signOut } = useAuthStore();
  const email = user?.email ?? 'User';

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-brand">
        <Heart size={24} fill="var(--color-primary)" color="var(--color-primary)" />
        {!collapsed && <span className="sidebar-brand-text">Health Tracker</span>}
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <button className="sidebar-collapse-btn" onClick={onToggle}>
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        {!collapsed && <span>Collapse</span>}
      </button>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {email[0]?.toUpperCase() ?? '?'}
          </div>
          {!collapsed && (
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{email}</div>
            </div>
          )}
          <button className="sidebar-logout" onClick={signOut} title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
