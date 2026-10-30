import { useState } from 'react';
import { cn } from '@properfy/frontend-standards';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBrowserPushDeps } from '../hooks/useBrowserPushDeps';
import { usePushSubscription, type PushState } from '../hooks/usePushSubscription';

const DESCRIPTIONS: Record<Exclude<PushState, 'loading'>, string> = {
  on: "On for this device. You'll get announcements even when the app is closed.",
  off: 'Get announcements on this device even when the app is closed.',
  enabling: 'Turning on…',
  disabling: 'Turning off…',
  blocked:
    'Notifications are blocked for Properfy. Turn them on in your device settings, then come back.',
  'ios-needs-install':
    'To get push notifications on iPhone, add Properfy to your Home Screen (iOS 16.4 or later) and open it from there.',
  unsupported: "This browser doesn't support push notifications.",
  unavailable: "Push notifications aren't available right now.",
};

// States where the switch cannot be toggled.
const DISABLED_STATES: PushState[] = [
  'loading',
  'enabling',
  'disabling',
  'blocked',
  'ios-needs-install',
  'unsupported',
  'unavailable',
];

/**
 * The per-device "Push notifications" control for `/profile/settings`. Mounts in
 * the F01-3 `push-preference-slot`. No mention of SMS (D5): the only preference
 * the inspector controls is push on this device.
 */
export function PushPreferenceCard() {
  const deps = useBrowserPushDeps();
  const { state, error, enable, disable } = usePushSubscription(deps);
  const [offline, setOffline] = useState(false);

  const isOn = state === 'on';
  const disabled = DISABLED_STATES.includes(state);

  const onToggle = () => {
    setOffline(false);
    if (isOn) {
      void disable();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setOffline(true);
      return;
    }
    void enable();
  };

  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[15px] font-bold text-foreground">Push notifications</h2>
        {state === 'loading' ? (
          <Skeleton className="h-6 w-11 rounded-full" />
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            aria-label="Push notifications"
            disabled={disabled}
            onClick={onToggle}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isOn ? 'bg-primary' : 'bg-muted',
              disabled && 'opacity-50',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-block h-5 w-5 transform rounded-full bg-card shadow transition-transform',
                isOn ? 'translate-x-5' : 'translate-x-0.5',
              )}
            />
          </button>
        )}
      </div>

      {state !== 'loading' && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {DESCRIPTIONS[state]}
        </p>
      )}
      {error === 'save-failed' && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Couldn't turn on push notifications. Try again.
        </p>
      )}
      {offline && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          You're offline. Connect to turn on push notifications.
        </p>
      )}
    </section>
  );
}
