import { NavLink } from 'react-router-dom';

interface NavItem {
  to: string;
  icon: string;
  label: string;
}

const navItems: NavItem[] = [
  { to: '/schedule', icon: 'mdi-calendar-clock', label: 'Schedule' },
  { to: '/marketplace', icon: 'mdi-tag-multiple', label: 'Offers' },
  { to: '/earnings', icon: 'mdi-cash-multiple', label: 'Earnings' },
  { to: '/profile', icon: 'mdi-account', label: 'Profile' },
];

export function BottomNavBar() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border-subtle bg-card-bg"
      data-testid="bottom-nav"
    >
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex min-h-touch min-w-touch flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-xs font-semibold transition-colors ${
              isActive ? 'text-primary' : 'text-text-muted'
            }`
          }
          data-testid={`nav-${item.label.toLowerCase()}`}
        >
          <i className={`mdi ${item.icon} text-xl`} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
