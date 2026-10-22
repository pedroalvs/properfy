import type { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import { CreditCard, User } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';

type NavIconProps = {
  size?: number | string;
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
};

type NavIcon = ComponentType<NavIconProps>;

/**
 * The Schedule and Offers glyphs reproduce the validated v3 artboard footer exactly.
 * Our installed lucide (0.468) has no equivalent — `Calendar1` draws a "1" digit rather
 * than a centred dot, and `Tag` was redesigned to a different shape — so both are inlined
 * with the artboard's own paths, sharing lucide's stroke geometry (24px, stroke-width 2,
 * round caps). Earnings and Profile use lucide `CreditCard`/`User`, which are byte-identical
 * to the artboard's Earnings and Account glyphs.
 */
function ScheduleIcon({ size = 24, className, ...props }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <circle cx="12" cy="15" r="2.4" />
    </svg>
  );
}

function OffersIcon({ size = 24, className, ...props }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M20.6 13.4 12 22l-8-8V4h10l6.6 6.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="8" cy="8" r="1.6" />
    </svg>
  );
}

interface NavItem {
  to: string;
  icon: NavIcon;
  label: string;
}

const navItems: NavItem[] = [
  { to: '/schedule', icon: ScheduleIcon, label: 'Schedule' },
  { to: '/marketplace', icon: OffersIcon, label: 'Offers' },
  { to: '/earnings', icon: CreditCard, label: 'Earnings' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export function BottomNavBar() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-safe-b"
      data-testid="bottom-nav"
    >
      <div className="mx-auto grid w-full max-w-screen-sm grid-cols-4 gap-1 px-[6px] pt-[9px]">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-touch min-w-touch touch-manipulation flex-col items-center justify-center gap-0.5 px-2 text-[11px] font-semibold transition-colors',
                  isActive ? 'text-primary' : 'text-faint',
                )
              }
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <Icon size={24} aria-hidden="true" className="shrink-0" />
              <span className="w-full truncate text-center">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
