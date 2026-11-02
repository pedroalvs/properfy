import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useUnsavedChangesPrompt } from '@/lib/use-unsaved-changes-prompt';
import { useSaveDayPlanOrder } from '../hooks/useSaveDayPlanOrder';
import { formatDelta } from '../lib/reorder-draft';
import type { ReorderDraft } from '../hooks/useReorderDraft';

interface ReorderSaveBarProps {
  draft: ReorderDraft;
  date: string;
}

const CONFLICT_MESSAGE = 'Your route was updated. Review it before saving your order.';
const MISMATCH_MESSAGE = 'Your stops changed. Review the route and try again.';
const PAST_MESSAGE = 'This day is in the past and can no longer be changed.';
const NETWORK_MESSAGE = "Couldn't save. Check your connection and try again.";
const RATE_LIMIT_MESSAGE = 'Too many changes in a short time. Try again in a minute.';
const SET_DISCARDED_MESSAGE = 'A stop was removed from your route. Your changes were discarded.';

/**
 * The sticky Save/Discard bar for a reorder draft, plus the alerts that keep the
 * inspector from overwriting a plan that changed underneath them. Shows only
 * while the draft is dirty; Save is blocked offline, while frozen (a newer
 * version arrived) and while STALE. A removed stop shows a one-off notice even
 * after the draft is discarded.
 */
export function ReorderSaveBar({ draft, date }: ReorderSaveBarProps) {
  const online = useIsOnline();
  const { save, isPending } = useSaveDayPlanOrder(date);
  const [alert, setAlert] = useState<string | null>(null);

  useUnsavedChangesPrompt(draft.isDirty, 'You have unsaved changes to your route. Leave anyway?');

  const onSave = async () => {
    setAlert(null);
    const result = await save({ appointmentIds: draft.order, basedOnVersion: draft.baseVersion });
    switch (result.status) {
      case 'SAVED':
        draft.clear();
        break;
      case 'CONFLICT':
        draft.clear();
        setAlert(CONFLICT_MESSAGE);
        break;
      case 'MISMATCH':
        draft.clear();
        setAlert(MISMATCH_MESSAGE);
        break;
      case 'PAST':
        draft.clear();
        setAlert(PAST_MESSAGE);
        break;
      case 'RATE_LIMIT':
        setAlert(RATE_LIMIT_MESSAGE);
        break;
      case 'NETWORK':
        setAlert(NETWORK_MESSAGE);
        break;
    }
  };

  const deltaText = draft.evaluation ? formatDelta(draft.evaluation.deltaFinishMin) : '';

  return (
    <>
      {draft.notice === 'SET_DISCARDED' && (
        <Alert tone="warning" data-testid="reorder-set-discarded">
          {SET_DISCARDED_MESSAGE}
        </Alert>
      )}
      {alert && (
        <Alert tone="warning" data-testid="reorder-save-alert">
          {alert}
        </Alert>
      )}

      {draft.isDirty && (
        <div
          data-testid="reorder-save-bar"
          className="pb-nav-clear sticky bottom-0 z-10 -mx-4 mt-2 border-t border-border bg-card px-4 pt-3"
        >
          {draft.frozen && (
            <Alert tone="warning" className="mb-2">
              {CONFLICT_MESSAGE}
            </Alert>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-muted-foreground">{deltaText}</p>
            <div className="flex shrink-0 gap-2">
              <Button variant="outlined" onClick={draft.frozen ? draft.review : draft.discard}>
                {draft.frozen ? 'Review' : 'Discard'}
              </Button>
              <Button
                onClick={onSave}
                loading={isPending}
                aria-busy={isPending}
                disabled={isPending || !online || draft.frozen || draft.stale}
              >
                {isPending ? 'Saving…' : 'Save order'}
              </Button>
            </div>
          </div>
          {!online && <p className="mt-1 text-xs text-muted-foreground">Connect to save your order.</p>}
          {draft.stale && !draft.frozen && (
            <p className="mt-1 text-xs text-muted-foreground">Updating your route…</p>
          )}
        </div>
      )}
    </>
  );
}
