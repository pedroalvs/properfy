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
                  ? // `bg-primary/10` was silently dropped for the life of this component —
                    // the tokens are `var(--color-X)` holding a hex, which Tailwind cannot
                    // decompose into channels, so the active tab had no background at all.
                    // `token()` in tailwind.config.ts now compiles the modifier to color-mix,
                    // so the plain class is honest again; this is the canary if that ever
                    // regresses. See src/__tests__/tailwind-emission.test.ts.
                    'bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(59,130,246,0.18)]'
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
