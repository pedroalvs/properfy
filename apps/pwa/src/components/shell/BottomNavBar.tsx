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
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border-subtle/70 bg-card-bg pb-safe-b"
      data-testid="bottom-nav"
    >
      <div className="mx-auto grid w-full max-w-screen-sm grid-cols-4 gap-1 px-3 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-touch min-w-touch flex-col items-center justify-center gap-0.5 rounded-2xl px-2 text-[11px] font-semibold transition-all ${
                isActive
                  ? // Not `bg-primary/10`: the design tokens are `var(--color-X)` holding a
                    // hex rather than channels with <alpha-value>, so Tailwind cannot apply
                    // an opacity modifier and silently drops the class — the active tab has
                    // had no background in production since it was written. color-mix is the
                    // project's established way to get alpha out of a token.
                    'bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] text-primary shadow-[inset_0_0_0_1px_rgba(59,130,246,0.18)]'
                  : 'text-text-muted'
              }`
            }
            data-testid={`nav-${item.label.toLowerCase()}`}
          >
            <i className={`mdi ${item.icon} text-[22px]`} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
