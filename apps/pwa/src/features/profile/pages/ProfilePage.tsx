import { CalendarClock, FileText, LogOut, SlidersHorizontal, User, Wallet } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MenuList, MenuRow } from '@/components/ui/MenuRow';
import { Badge } from '@/components/ui/Badge';

/** Small eyebrow label above each menu group. */
function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

export function ProfilePage() {
  const { user, logout } = useAuth();

  if (!user) return null;

  // A logged-in inspector is Active unless the account carries another status.
  const isActive = (user.status ?? 'ACTIVE') === 'ACTIVE';

  return (
    <div className="w-full pb-20">
      {/* v3 Profile opens directly on the identity card — no redundant "Account"
          title bar above it. The global OfflineBanner + bottom nav are unaffected. */}
      <div className="flex flex-col gap-3 p-4">
        {/* Identity header */}
        <section className="flex items-center gap-4 rounded-card border border-border bg-card p-4 shadow-sm">
          {user.inspectorPhotoUrl ? (
            <img
              src={user.inspectorPhotoUrl}
              alt={user.name}
              className="h-14 w-14 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold tracking-tight text-foreground">{user.name}</h1>
            <p className="truncate text-sm text-muted-foreground">Inspector</p>
          </div>
          {isActive && <Badge tone="green">Active</Badge>}
        </section>

        {/* Work */}
        <SectionLabel>Work</SectionLabel>
        <MenuList>
          <MenuRow
            icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
            label="Earnings"
            sublabel="Payments and invoices"
            to="/earnings"
          />
        </MenuList>

        {/* Account */}
        <SectionLabel>Account</SectionLabel>
        <MenuList>
          <MenuRow
            icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
            label="Availability"
            sublabel="Working days and areas"
            to="/profile/availability"
          />
          <MenuRow
            icon={<FileText className="h-5 w-5" aria-hidden="true" />}
            label="Documents"
            sublabel="Insurance, police check, ABN"
            to="/profile/documents"
          />
          <MenuRow
            icon={<User className="h-5 w-5" aria-hidden="true" />}
            label="Account details"
            sublabel="Profile, phone, timezone and security"
            to="/profile/account"
          />
          <MenuRow
            icon={<SlidersHorizontal className="h-5 w-5" aria-hidden="true" />}
            label="App settings"
            sublabel="Install and app info"
            to="/profile/settings"
          />
        </MenuList>

        {/* Log out */}
        <MenuList className="mt-2">
          <MenuRow
            icon={<LogOut className="h-5 w-5" aria-hidden="true" />}
            label="Log out"
            onClick={logout}
            trailing={<></>}
          />
        </MenuList>

        <p className="text-center text-xs text-muted-foreground">Properfy Inspector v1.0</p>
      </div>
    </div>
  );
}
