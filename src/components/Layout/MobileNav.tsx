import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  Camera,
  MessageCircle,
  Users,
  MoreHorizontal,
} from 'lucide-react';
import { useState } from 'react';

const primaryNav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/body', icon: Activity, label: 'Body' },
  { to: '/scanner', icon: Camera, label: 'Scan' },
  { to: '/doctor-ai', icon: MessageCircle, label: 'Chat' },
  { to: '/family', icon: Users, label: 'Family' },
];

const moreNav = [
  { to: '/reports', label: 'Reports' },
  { to: '/restrictions', label: 'Restrictions' },
  { to: '/wearables', label: 'Wearables' },
  { to: '/doctors', label: 'Doctors' },
];

export default function MobileNav() {
  const [showMore, setShowMore] = useState(false);

  return (
    <>
      {showMore && (
        <div className="mobile-more-overlay" onClick={() => setShowMore(false)}>
          <div className="mobile-more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-more-header">
              <span>More</span>
              <button onClick={() => setShowMore(false)} className="btn btn-ghost btn-sm">&times;</button>
            </div>
            {moreNav.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className="mobile-more-item"
                onClick={() => setShowMore(false)}
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <nav className="mobile-nav">
        {primaryNav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={20} strokeWidth={1.75} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          className={`mobile-nav-item${showMore ? ' active' : ''}`}
          onClick={() => setShowMore(!showMore)}
        >
          <MoreHorizontal size={20} strokeWidth={1.75} />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
