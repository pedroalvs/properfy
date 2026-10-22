import { useMemo } from 'react';
import { CalendarClock, FileText, LogOut, Star, User, Wallet } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { MenuList, MenuRow } from '@/components/ui/MenuRow';
import { Badge } from '@/components/ui/Badge';
import { ProfileTile, type ProfileTileTone } from '../components/ProfileTile';
import { useInspectorMe } from '../hooks/useInspectorMe';
import { useInspectorAvailabilityTemplate } from '../hooks/useInspectorAvailabilityTemplate';
import { getDocumentsStatus } from '../lib/documents-status';
import { summarizeAvailability } from '../lib/availability-summary';

export function ProfilePage() {
  const { user, logout } = useAuth();
  const timeZone = useEffectiveTimezone();
  const { data: inspectorMe } = useInspectorMe();
  const { data: availability } = useInspectorAvailabilityTemplate();

  // useInspectorMe resolves to the `{ data: InspectorMe }` envelope.
  const inspector = inspectorMe?.data;

  const documents = useMemo(
    () => (inspector ? getDocumentsStatus(inspector, timeZone) : null),
    [inspector, timeZone],
  );
  const availabilitySummary = useMemo(
    () => summarizeAvailability(availability?.template),
    [availability],
  );
  const rating = inspector?.rating;

  if (!user) return null;

  // A logged-in inspector is Active unless the account carries another status.
  const isActive = (user.status ?? 'ACTIVE') === 'ACTIVE';

  const documentsTone: ProfileTileTone = documents?.tone ?? 'default';
  const documentsValue = documents?.label ?? 'Insurance & police check';

  return (
    <div className="w-full pb-20">
      <div className="flex flex-col gap-4 p-4">
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
            <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <span>Inspector</span>
              {rating?.average != null && (
                <span className="inline-flex items-center gap-0.5 font-semibold text-foreground">
                  <Star className="h-3.5 w-3.5 fill-current text-warning" aria-hidden="true" />
                  {rating.average.toFixed(1)}
                </span>
              )}
            </p>
          </div>
          {isActive && <Badge tone="green">Active</Badge>}
        </section>

        {/* Big tiles — glanceable, large touch targets for the field. */}
        <div className="grid grid-cols-2 gap-3">
          <ProfileTile
            icon={<Wallet className="h-6 w-6" aria-hidden="true" />}
            label="Earnings"
            value="Payments & invoices"
            to="/earnings"
          />
          <ProfileTile
            icon={<CalendarClock className="h-6 w-6" aria-hidden="true" />}
            label="Availability"
            value={availabilitySummary}
            to="/profile/availability"
          />
          <ProfileTile
            icon={<FileText className="h-6 w-6" aria-hidden="true" />}
            label="Documents"
            value={documentsValue}
            tone={documentsTone}
            to="/profile/documents"
            data-testid="profile-tile-documents"
          />
          <ProfileTile
            icon={<User className="h-6 w-6" aria-hidden="true" />}
            label="My account"
            value="Details & security"
            to="/profile/account"
          />
        </div>

        {/* Log out */}
        <MenuList className="mt-1">
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
