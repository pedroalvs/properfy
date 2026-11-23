import type { PushState } from '../hooks/usePushSubscription';

/**
 * Per-state copy for the push surfaces, shared by `PushPreferenceCard` (the
 * `/profile/settings` toggle) and `EnablePushModal` (the top-bar indicator's
 * dialog) so the two never drift. `loading` has no copy — the card shows a
 * skeleton and the modal is not opened while resolving.
 */
export const PUSH_STATE_DESCRIPTIONS: Record<Exclude<PushState, 'loading'>, string> = {
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
