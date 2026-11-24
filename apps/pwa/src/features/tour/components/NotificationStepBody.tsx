import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { usePushControl } from '@/features/push/context/PushControlProvider';
import { PUSH_STATE_DESCRIPTIONS } from '@/features/push/lib/push-copy';

/**
 * Body of the tour's notifications step (R4). Offers a button that requests the OS
 * permission ON THIS GESTURE via the shared `usePushControl` context, which is the
 * only moment the browser allows a prompt. The inspector can always skip/advance
 * without enabling — the step never blocks the tour.
 *
 * Adapts to the resolved push state: a confirmation once on, and the guidance copy
 * when enabling is impossible (blocked / iOS-needs-install / unsupported /
 * unavailable) so the button is never shown where it would silently fail.
 */
export function NotificationStepBody() {
  const { state, requestEnable } = usePushControl();
  const [working, setWorking] = useState(false);

  if (state === 'on') {
    return (
      <p className="text-sm text-muted-foreground">
        You're all set — notifications are on for this device.
      </p>
    );
  }

  if (
    state === 'blocked' ||
    state === 'ios-needs-install' ||
    state === 'unsupported' ||
    state === 'unavailable'
  ) {
    return <p className="text-sm text-muted-foreground">{PUSH_STATE_DESCRIPTIONS[state]}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Get your day plan, route changes and announcements even when the app is closed.
      </p>
      <Button
        variant="primary"
        loading={working || state === 'enabling'}
        onClick={async () => {
          setWorking(true);
          try {
            await requestEnable();
          } finally {
            setWorking(false);
          }
        }}
      >
        Turn on notifications
      </Button>
    </div>
  );
}
