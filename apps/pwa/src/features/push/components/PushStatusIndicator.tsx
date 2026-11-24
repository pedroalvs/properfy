import { useContext } from 'react';
import { BellOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PushControlContext } from '../context/PushControlProvider';
import type { PushState } from '../hooks/usePushSubscription';

/**
 * States in which notifications are OFF for this device and the inspector can act
 * on it (R3). The indicator stays visible after an opt-out too — it is the
 * persistent affordance to turn push back on. Hidden while on, resolving
 * (loading/enabling/disabling) or genuinely unactionable (unsupported browser /
 * no VAPID configured), where a disabled bell would only be noise.
 */
const INDICATOR_STATES: ReadonlySet<PushState> = new Set<PushState>([
  'off',
  'blocked',
  'ios-needs-install',
]);

/**
 * A top-right bell-off button shown in the `TopBar` when push is disabled on this
 * device. Clicking it opens the app-wide {@link EnablePushModal} to turn push on.
 */
export function PushStatusIndicator() {
  // Read the context directly (not the throwing `usePushControl`): the TopBar is
  // mounted by every page, including in tests that render a page without the
  // provider — there the indicator simply stays hidden.
  const push = useContext(PushControlContext);
  if (!push || !INDICATOR_STATES.has(push.state)) return null;
  const { openEnableModal } = push;

  return (
    <Button
      variant="icon"
      onClick={openEnableModal}
      aria-label="Notifications are off — tap to turn them on"
      data-testid="push-status-indicator"
      className="h-9 w-9 min-h-0 min-w-0 text-muted-foreground"
    >
      <BellOff className="h-5 w-5" aria-hidden="true" />
    </Button>
  );
}
