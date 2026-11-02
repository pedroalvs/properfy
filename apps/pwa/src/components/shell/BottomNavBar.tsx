import type { ComponentType } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { House, Ellipsis } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { useUnreadNoticeCount } from '@/features/announcements/hooks/useUnreadNoticeCount';

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
 * round caps). Today uses lucide `House`; More uses lucide `Ellipsis`.
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
  active: boolean;
  /** `true` for the More tab, which carries the unread-announcements badge. */
  showsBadge?: boolean;
}

export function BottomNavBar() {
  const { count: unreadNotices } = useUnreadNoticeCount();

  // More owns the whole profile + earnings hub, so it stays active across both
  // (Earnings lives inside More). `/foo/*` matches the base and its descendants.
  // Every useMatch runs unconditionally (rules of hooks); combine after.
  const todayActive = useMatch('/today/*') !== null;
  const scheduleActive = useMatch('/schedule/*') !== null;
  const offersActive = useMatch('/marketplace/*') !== null;
  const profileActive = useMatch('/profile/*') !== null;
  const earningsActive = useMatch('/earnings/*') !== null;
  const moreActive = profileActive || earningsActive;

  const navItems: NavItem[] = [
    { to: '/today', icon: House, label: 'Today', active: todayActive },
    { to: '/schedule', icon: ScheduleIcon, label: 'Schedule', active: scheduleActive },
    { to: '/marketplace', icon: OffersIcon, label: 'Offers', active: offersActive },
    { to: '/profile', icon: Ellipsis, label: 'More', active: moreActive, showsBadge: true },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-safe-b"
      data-testid="bottom-nav"
    >
      <div className="mx-auto grid w-full max-w-screen-sm grid-cols-4 gap-1 px-[6px] pt-[9px]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const showBadge = Boolean(item.showsBadge) && unreadNotices > 0;
          const badgeLabel = unreadNotices > 9 ? '9+' : String(unreadNotices);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={item.active ? 'page' : undefined}
              aria-label={showBadge ? `${item.label}, ${unreadNotices} unread announcements` : undefined}
              className={cn(
                'flex min-h-touch min-w-touch touch-manipulation flex-col items-center justify-center gap-0.5 px-2 text-[11px] font-semibold transition-colors',
                item.active ? 'text-primary' : 'text-faint',
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <span className="relative shrink-0">
                <Icon size={24} aria-hidden="true" className="shrink-0" />
                {showBadge && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground"
                  >
                    {badgeLabel}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
