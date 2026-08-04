
import { formatInstantDateTime } from '@/lib/format-date';
import { StarRating } from '@/components/ui/StarRating';
import { formatTimezoneLabel } from '@/components/ui/TimezonePicker';

interface ProfileCardProps {
  name: string;
  email: string;
  role: string;
  status?: string;
  phone?: string | null;
  /** Effective IANA timezone (personal ?? platform). */
  timezone?: string | null;
  totpEnabled?: boolean;
  lastLoginAt?: string | null;
  photoUrl?: string | null;
  avatarUploader?: React.ReactNode;
  /** Average satisfaction rating; null when there are no responses. */
  ratingAvg?: number | null;
  ratingCount?: number;
  /** Total inspections completed. */
  completedCount?: number;
  ratingLoading?: boolean;
  /** Renders the stats strip. Meaningless for a non-inspector, so opt-in. */
  showStats?: boolean;
}

const roleLabelMap: Record<string, string> = {
  INSP: 'Inspector',
  AM: 'Admin Master',
  OP: 'Operator',
  CL_ADMIN: 'Real Estate',
  CL_USER: 'Real Estate Operator',
};

function formatLastLogin(value: string | null | undefined): string {
  return formatInstantDateTime(value) || '—';
}

function formatStatus(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function ProfileCard({ name, email, role, status, phone, timezone, totpEnabled, lastLoginAt, photoUrl, avatarUploader, ratingAvg, ratingCount = 0, completedCount = 0, ratingLoading = false, showStats = false }: ProfileCardProps) {
  const roleLabel = roleLabelMap[role] ?? role;

  return (
    <div className="rounded-[24px] border border-white/70 bg-white/92 p-6 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={name}
              className="h-16 w-16 rounded-2xl object-cover"
            />
          ) : (
            // The ring was `rgba(5,150,105,0.10)` — emerald-600 around a coral tint, the
            // same mismatch the bottom nav had in blue. Same alpha, now derived from the
            // token it outlines.
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-real-estate/10 text-2xl font-bold text-real-estate ring-1 ring-inset ring-real-estate/10">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          {avatarUploader && (
            <div className="absolute -bottom-1 -right-1">{avatarUploader}</div>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-text-primary">{name}</h2>
          <p className="truncate text-sm text-text-secondary">{email}</p>
          <span className="mt-1 inline-block rounded bg-real-estate/10 px-2 py-0.5 text-xs font-semibold text-real-estate">
            {roleLabel}
          </span>
        </div>
      </div>

      {showStats && (
        // Fixed min-height across all three states so the card never jumps when
        // the request resolves.
        <div className="mt-5 grid min-h-[56px] grid-cols-2 divide-x divide-black/5 border-t border-black/5 pt-4">
          <div className="flex flex-col items-center justify-center gap-0.5">
            {ratingLoading ? (
              <>
                <div className="h-6 w-16 animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
              </>
            ) : (
              <>
                <StarRating value={ratingAvg} size="lg" showValue emptyLabel="No ratings yet" />
                <span className="text-xs text-text-secondary">
                  {ratingCount > 0 ? `Average of ${ratingCount}` : 'Average rating'}
                </span>
              </>
            )}
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5">
            {ratingLoading ? (
              <>
                <div className="h-6 w-12 animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
              </>
            ) : (
              <>
                <span className="text-2xl font-bold text-text-primary">{completedCount}</span>
                <span className="text-xs text-text-secondary">Services</span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 border-t border-black/5 pt-4 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-secondary">Account Status</span>
          <span className="font-medium text-text-primary">{formatStatus(status)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-secondary">Phone</span>
          <span className="font-medium text-text-primary">{phone ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-secondary">Timezone</span>
          <span className="font-medium text-text-primary">{formatTimezoneLabel(timezone) ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-secondary">Two-Factor</span>
          <span className={totpEnabled ? 'font-medium text-green-700' : 'font-medium text-amber-700'}>
            {totpEnabled ? 'Enabled' : 'Not enabled'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-secondary">Last Login</span>
          <span className="font-medium text-text-primary">{formatLastLogin(lastLoginAt)}</span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
        Profile details are managed by your operations team. Use this screen for account security and device access.
      </div>
    </div>
  );
}
