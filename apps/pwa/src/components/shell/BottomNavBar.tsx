import { NavLink } from 'react-router-dom';
import { CalendarClock, Tag, Wallet, User, type LucideIcon } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

const navItems: NavItem[] = [
  { to: '/schedule', icon: CalendarClock, label: 'Schedule' },
  { to: '/marketplace', icon: Tag, label: 'Offers' },
  { to: '/earnings', icon: Wallet, label: 'Earnings' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export function BottomNavBar() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-safe-b"
      data-testid="bottom-nav"
    >
      <div className="mx-auto grid w-full max-w-screen-sm grid-cols-4 gap-1 px-3 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-touch min-w-touch flex-col items-center justify-center gap-0.5 rounded-2xl px-2 text-[11px] font-semibold transition-all',
                  isActive
                    ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/20'
                    : 'text-muted-foreground',
                )
              }
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <Icon size={22} aria-hidden="true" className="shrink-0" />
              <span className="w-full truncate text-center">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
