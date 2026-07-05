import { useDetailQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/hooks/useAuth';

interface InspectorDetail {
  id: string;
  fullName: string | null;
  abn: string | null;
  dateOfBirth: string | null;
  insuranceFileKey: string | null;
  insuranceExpiresAt: string | null;
  policeCheckFileKey: string | null;
  policeCheckExpiresAt: string | null;
  insuranceMetaJson: { fileName?: string | null } | null;
  policeCheckMetaJson: { fileName?: string | null } | null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(date);
}

function ExpiryBadge({ expiry }: { expiry: string | null }) {
  if (!expiry) return <span className="text-xs text-text-muted">No expiry set</span>;

  const expiryDate = new Date(expiry);
  const now = new Date();
  const isExpired = expiryDate < now;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const isExpiringSoon = !isExpired && expiryDate.getTime() - now.getTime() < thirtyDays;

  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-semibold text-error">
        <i className="mdi mdi-alert-circle text-xs" aria-hidden="true" />
        Expired {formatDate(expiry)}
      </span>
    );
  }

  if (isExpiringSoon) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
        <i className="mdi mdi-clock-alert-outline text-xs" aria-hidden="true" />
        Expires {formatDate(expiry)}
      </span>
    );
  }

  return (
    <span className="text-xs text-text-secondary">Expires {formatDate(expiry)}</span>
  );
}

export function InspectorDetailsCard() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useDetailQuery<InspectorDetail>(
    ['inspector', 'me', user?.id],
    '/v1/inspectors/me',
    {
      enabled: !!user,
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );

  if (isLoading) {
    return (
      <div className="rounded-[24px] border border-white/70 bg-white/92 p-6 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  if (isError || !data?.data) {
    return null;
  }

  const inspector = data.data;

  return (
    <div className="rounded-[24px] border border-white/70 bg-white/92 p-6 shadow-[0_14px_30px_rgba(15,23,42,0.06)]" data-testid="inspector-details-card">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Inspector Details</p>

      <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-secondary">Full Name</span>
          <span className="font-medium text-text-primary">{inspector.fullName ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-secondary">ABN</span>
          <span className="font-medium text-text-primary">{inspector.abn ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-secondary">Date of Birth</span>
          <span className="font-medium text-text-primary">{formatDate(inspector.dateOfBirth)}</span>
        </div>
      </div>

      {/* Documents */}
      <div className="mt-5 border-t border-black/5 pt-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Documents</p>
        <div className="mt-3 flex flex-col gap-3">
          {/* Insurance */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <i className="mdi mdi-shield-check text-base text-text-secondary" aria-hidden="true" />
              <span className="text-sm text-text-primary">Insurance</span>
            </div>
            <div className="flex items-center gap-2">
              {inspector.insuranceFileKey || inspector.insuranceMetaJson ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                  <i className="mdi mdi-check text-xs" aria-hidden="true" />
                  On file
                </span>
              ) : (
                <span className="text-xs text-text-muted">Not uploaded</span>
              )}
              <ExpiryBadge expiry={inspector.insuranceExpiresAt} />
            </div>
          </div>

          {/* Police Check */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <i className="mdi mdi-card-account-details text-base text-text-secondary" aria-hidden="true" />
              <span className="text-sm text-text-primary">Police Check</span>
            </div>
            <div className="flex items-center gap-2">
              {inspector.policeCheckFileKey || inspector.policeCheckMetaJson ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                  <i className="mdi mdi-check text-xs" aria-hidden="true" />
                  On file
                </span>
              ) : (
                <span className="text-xs text-text-muted">Not uploaded</span>
              )}
              <ExpiryBadge expiry={inspector.policeCheckExpiresAt} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
        Document uploads and updates are managed by your operations team. Contact them if any details need updating.
      </div>
    </div>
  );
}
