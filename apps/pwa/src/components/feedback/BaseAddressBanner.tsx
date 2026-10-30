import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { useInspectorMe } from '@/features/profile/hooks/useInspectorMe';

const TARGET = '/profile/account#base-address';

/**
 * Fixed, non-dismissable prompt shown on the home and profile while the inspector's
 * base address has no coordinates (contract 00.4, decision D2). Two variants:
 *   1. no saved address  → "Add your base address"
 *   2. saved but not located (geocode failed or legacy shape) → "We couldn't locate…"
 *
 * It renders nothing while the inspector record is loading or errored (avoids a
 * boot flash), does not block anything, and disappears on its own once a save with
 * coordinates invalidates the `['inspector']` query.
 *
 * Lives in `components/feedback/` (not `features/profile/`) so the schedule home can
 * mount it without a cross-feature import; it still owns its own `useInspectorMe`
 * query so callers pass nothing.
 */
export function BaseAddressBanner() {
  const { data: me, isLoading, isError } = useInspectorMe();

  if (isLoading || isError || !me) return null;

  const inspector = me.data;
  if (!inspector || inspector.baseLat != null) return null;

  const hasAddress = inspector.address != null;
  const title = hasAddress
    ? 'We couldn’t locate your base address — please check it'
    : 'Add your base address';
  const linkLabel = hasAddress ? 'Check address' : 'Add address';

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning/10 p-4"
    >
      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {!hasAddress && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            We use it as the starting point for your day.
          </p>
        )}
        <Link
          to={TARGET}
          className="mt-1 inline-block min-h-touch text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          {linkLabel}
        </Link>
      </div>
    </div>
  );
}
