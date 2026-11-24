/**
 * Per-device push opt-out store (R2). Push is wanted by DEFAULT: the absence of
 * this key means "this device wants push notifications", so a fresh device
 * auto-subscribes where the OS already granted permission and is nudged by the
 * top-bar indicator otherwise. Only an explicit opt-out (toggle off or the modal's
 * "Agora não") silences it and survives reloads.
 *
 * Stored in `localStorage` under {@link PUSH_OPT_OUT_KEY}; every access is
 * try/catch-guarded because storage can be unavailable (private mode, blocked
 * site data). It is cleared on logout (see `lib/auth-storage.ts`) so the next
 * inspector on a shared device starts from the default-on state.
 */
export const PUSH_OPT_OUT_KEY = 'properfy.pwa.pushOptOut';

/** True only when this device explicitly opted out. Absent/unreadable → false (wants push). */
export function getPushOptOut(): boolean {
  try {
    return localStorage.getItem(PUSH_OPT_OUT_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Persist (opt out) or clear (opt back in) the per-device preference. */
export function setPushOptOut(value: boolean): void {
  try {
    if (value) localStorage.setItem(PUSH_OPT_OUT_KEY, 'true');
    else localStorage.removeItem(PUSH_OPT_OUT_KEY);
  } catch {
    /* storage unavailable — the preference is best-effort */
  }
}
