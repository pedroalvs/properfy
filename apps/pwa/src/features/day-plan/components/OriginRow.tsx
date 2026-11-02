import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Pencil } from 'lucide-react';
import type { DayPlanResponse } from '@properfy/shared';
import { Alert } from '@/components/ui/Alert';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useDayPlanOrigin } from '../hooks/useDayPlanOrigin';
import { OriginSheet } from './OriginSheet';

interface OriginRowProps {
  plan: DayPlanResponse;
  /** Past date or a NOT_FOUND plan: read-only, no editing. */
  readOnly?: boolean;
}

const CHANGE_LABEL = 'Change starting point for this day';
const BASE_ADDRESS_HREF = '/profile/account#base-address';

/**
 * The route's starting-point row. Edits the day's origin (BASE/OVERRIDE/NONE)
 * through the OriginSheet; after the first check-in the server reports
 * `LAST_STOP`, which is text only — no pencil, no "Use my base address"
 * (L-F04-07). Read-only on a past date or a not-found plan.
 */
export function OriginRow({ plan, readOnly = false }: OriginRowProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isOnline = useIsOnline();
  const { showError } = useSnackbar();
  const { clearOrigin, isPending } = useDayPlanOrigin(plan.date);

  const { source, label } = plan.origin;
  const overrideAddress = plan.originOverride?.address ?? null;

  const openSheet = () => setSheetOpen(true);
  const returnFocus = () => triggerRef.current?.focus();
  // DELETE …/origin is a write: require a connection and surface a failure, mirroring
  // the set path (OriginSheet). Without this the error is swallowed and the row is a dead end.
  const handleClearOrigin = async () => {
    const err = await clearOrigin();
    if (err) showError(err.message);
  };

  // After the first check-in: continuing from the last stop. Text only.
  if (source === 'LAST_STOP') {
    return (
      <p className="flex items-center gap-2 text-sm text-foreground" data-testid="origin-row">
        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        Continuing from: {label}
      </p>
    );
  }

  if (source === 'NONE') {
    return (
      <div data-testid="origin-row">
        <Alert tone="warning">
          <p>No base address: route has no starting point</p>
          <Link to={BASE_ADDRESS_HREF} className="mt-1 inline-block font-semibold underline">
            Add base address
          </Link>
        </Alert>
        {!readOnly && (
          <>
            <button
              ref={triggerRef}
              type="button"
              className="mt-2 text-sm font-semibold text-primary"
              onClick={openSheet}
            >
              Set a starting point for this day
            </button>
            <OriginSheet
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              date={plan.date}
              overrideAddress={overrideAddress}
              onSaved={returnFocus}
            />
          </>
        )}
      </div>
    );
  }

  // source === 'BASE' | 'OVERRIDE'
  const isOverride = source === 'OVERRIDE';
  const text = isOverride ? `Starting from: ${label} (this day only)` : `Starting from: ${label}`;

  if (readOnly) {
    return (
      <p className="text-sm text-foreground" data-testid="origin-row">
        {text}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1" data-testid="origin-row">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Starting from ${label}. ${CHANGE_LABEL}`}
        className="flex items-center gap-2 text-left text-sm font-semibold text-foreground"
        onClick={openSheet}
      >
        <span>{text}</span>
        <Pencil className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      </button>
      {isOverride && (
        <>
          <button
            type="button"
            className="self-start text-sm font-semibold text-primary disabled:opacity-50"
            disabled={!isOnline || isPending}
            onClick={() => void handleClearOrigin()}
          >
            Use my base address
          </button>
          {!isOnline && (
            <span className="text-xs text-muted-foreground">
              You&apos;re offline. Connect to change your starting point.
            </span>
          )}
        </>
      )}
      <OriginSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        date={plan.date}
        overrideAddress={overrideAddress}
        onSaved={returnFocus}
      />
    </div>
  );
}
