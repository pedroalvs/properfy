import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import type { DayPlanResponse } from '@properfy/shared';

interface RouteWarningsProps {
  originWarning: DayPlanResponse['originWarning'];
  approximate: boolean;
  stale: boolean;
}

const BASE_ADDRESS_HREF = '/profile/account#base-address';

/**
 * Stacked, order-fixed route banners shared by the Today and Route screens:
 * the origin warning (no / unlocated base), the approximate-route notice, and
 * the STALE "updating" status. Each renders only when its condition holds.
 */
export function RouteWarnings({ originWarning, approximate, stale }: RouteWarningsProps) {
  return (
    <div className="flex flex-col gap-2">
      {originWarning === 'NO_BASE' && (
        <Alert tone="warning">
          <p>No base address: route has no starting point</p>
          <Link to={BASE_ADDRESS_HREF} className="mt-1 inline-block font-semibold underline">
            Add base address
          </Link>
        </Alert>
      )}
      {originWarning === 'BASE_NOT_LOCATED' && (
        <Alert tone="warning">
          <p>We couldn&apos;t locate your base address — please check it</p>
          <Link to={BASE_ADDRESS_HREF} className="mt-1 inline-block font-semibold underline">
            Check address
          </Link>
        </Alert>
      )}
      {approximate && <Alert tone="info">Approximate route: travel times are estimates</Alert>}
      {stale && (
        <Alert tone="info" role="status">
          Updating your route…
        </Alert>
      )}
    </div>
  );
}
