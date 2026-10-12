import { AlertCircle, Check, ClockAlert, IdCard, ShieldCheck } from 'lucide-react';
import { useInspectorMe } from '../hooks/useInspectorMe';
import { todayInTzDateString } from '@properfy/shared';
import { useAuth } from '@/hooks/useAuth';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { formatCivilDate } from '@/lib/format-date';

/** Local calendar day of a Date, as YYYY-MM-DD. */
function toIsoDay(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/**
 * Date of birth and the two expiry dates are @db.Date calendar days.
 *
 * The previous implementation parsed them with `new Date('2026-03-18')` — which
 * is UTC midnight — and then formatted in the RUNTIME's timezone, so a browser
 * behind UTC rendered the previous day. A calendar day carries no timezone, so
 * formatCivilDate reads it verbatim.
 */
function formatDate(value: string | null | undefined): string {
  return formatCivilDate(value) || '—';
}

function ExpiryBadge({ expiry, timeZone }: { expiry: string | null; timeZone: string }) {
  if (!expiry) return <span className="text-xs text-muted-foreground">No expiry set</span>;

  // Compared as calendar days, not instants. `new Date('2026-03-18')` is UTC
  // midnight, which is 10-11am Sydney, so comparing it against `new Date()`
  // flipped the badge to "Expired" mid-morning ON the expiry day.
  const today = todayInTzDateString(timeZone);
  const expiryDay = expiry.slice(0, 10);
  const isExpired = expiryDay < today;
  const soonCutoff = new Date(`${today}T12:00:00`);
  soonCutoff.setDate(soonCutoff.getDate() + 30);
  const isExpiringSoon = !isExpired && expiryDay <= toIsoDay(soonCutoff);

  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
        <AlertCircle size={12} aria-hidden="true" />
        Expired {formatDate(expiry)}
      </span>
    );
  }

  if (isExpiringSoon) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
        <ClockAlert size={12} aria-hidden="true" />
        Expires {formatDate(expiry)}
      </span>
    );
  }

  return (
    <span className="text-xs text-muted-foreground">Expires {formatDate(expiry)}</span>
  );
}

export function InspectorDetailsCard() {
  const { data, isLoading, isError } = useInspectorMe();
  const { user } = useAuth();
  const timeZone = useEffectiveTimezone();

  if (isLoading) {
    return (
      <div className="rounded-card border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (isError || !data?.data) {
    return null;
  }

  const inspector = data.data;

  return (
    <div className="rounded-card border border-border bg-card p-6 shadow-sm" data-testid="inspector-details-card">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Inspector Details</p>

      <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Full Name</span>
          {/* The inspector record's fullName is often unpopulated; fall back to the
              authenticated user's display name — the same source the Account card uses. */}
          <span className="font-medium text-foreground">{inspector.fullName || user?.name || '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">ABN</span>
          <span className="font-medium text-foreground">{inspector.abn ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Date of Birth</span>
          <span className="font-medium text-foreground">{formatDate(inspector.dateOfBirth)}</span>
        </div>
      </div>

      {/* Documents */}
      <div className="mt-5 border-t border-black/5 pt-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Documents</p>
        <div className="mt-3 flex flex-col gap-3">
          {/* Insurance */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-muted-foreground" aria-hidden="true" />
              <span className="text-sm text-foreground">Insurance</span>
            </div>
            <div className="flex items-center gap-2">
              {inspector.insuranceFileKey || inspector.insuranceMetaJson ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                  <Check size={12} aria-hidden="true" />
                  On file
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Not uploaded</span>
              )}
              <ExpiryBadge expiry={inspector.insuranceExpiresAt} timeZone={timeZone} />
            </div>
          </div>

          {/* Police Check */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <IdCard size={16} className="text-muted-foreground" aria-hidden="true" />
              <span className="text-sm text-foreground">Police Check</span>
            </div>
            <div className="flex items-center gap-2">
              {inspector.policeCheckFileKey || inspector.policeCheckMetaJson ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                  <Check size={12} aria-hidden="true" />
                  On file
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Not uploaded</span>
              )}
              <ExpiryBadge expiry={inspector.policeCheckExpiresAt} timeZone={timeZone} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Document uploads and updates are managed by your operations team. Contact them if any details need updating.
      </div>
    </div>
  );
}
