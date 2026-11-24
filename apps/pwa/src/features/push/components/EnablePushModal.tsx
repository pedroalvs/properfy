import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { usePushControl } from '../context/PushControlProvider';
import { PUSH_STATE_DESCRIPTIONS } from '../lib/push-copy';

/**
 * App-wide modal (R3) that asks the inspector to turn push notifications on. It is
 * opened by the top-bar {@link PushStatusIndicator} and driven entirely by the
 * {@link usePushControl} context (open state + actions). Mounted once in
 * `PwaLayout`.
 *
 * The primary colored "Turn on" button (the "Yes") calls `requestEnable` — clears
 * the opt-out and requests OS permission on this gesture. "Not now" persists an
 * opt-out so the device stays quiet until the inspector asks again.
 *
 * For `blocked` (the OS denied permission; a grant prompt can't help) and
 * `ios-needs-install` (must add to Home Screen first) the modal shows the guidance
 * copy with a single acknowledge button — no "Turn on" that would silently fail.
 */
export function EnablePushModal() {
  const { state, isEnableModalOpen, requestEnable, declinePersistently, closeEnableModal } =
    usePushControl();

  const needsGuidanceOnly = state === 'blocked' || state === 'ios-needs-install';
  const body =
    state === 'blocked' || state === 'ios-needs-install'
      ? PUSH_STATE_DESCRIPTIONS[state]
      : 'Turn on push to get day plans, route changes and announcements even when the app is closed.';

  return (
    <Dialog open={isEnableModalOpen} onOpenChange={(open) => (open ? undefined : closeEnableModal())}>
      <DialogContent data-testid="enable-push-modal">
        <DialogHeader>
          <DialogTitle>Turn on notifications?</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {needsGuidanceOnly ? (
            <Button variant="primary" block onClick={closeEnableModal}>
              Got it
            </Button>
          ) : (
            <>
              <Button variant="primary" block onClick={() => void requestEnable()}>
                Turn on
              </Button>
              <Button variant="outlined" block onClick={declinePersistently}>
                Not now
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
