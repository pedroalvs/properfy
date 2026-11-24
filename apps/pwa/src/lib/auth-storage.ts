const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
// Mirror of APP_STATE_HEARTBEAT_KEY in app/useAppStateHeartbeat.ts. Inlined (not
// imported) to avoid an api → auth-storage → heartbeat → api import cycle. Cleared
// on logout so the next inspector on a shared device beats immediately.
const APP_STATE_HEARTBEAT_KEY = 'properfy.pwa.appStateHeartbeat';
// Mirror of TOUR_PENDING_KEY in features/tour/lib/tour-pending-storage.ts. Inlined
// (not imported) to avoid an import cycle. Cleared on logout so a new inspector on
// a shared device is not blocked from seeing (or wrongly attributed) the tour.
const TOUR_PENDING_KEY = 'properfy.pwa.tourCompletedPending';
// Mirror of PUSH_OPT_OUT_KEY in features/push/lib/push-preference.ts. Inlined (not
// imported) to avoid an import cycle. Cleared on logout so the next inspector on a
// shared device starts from the default-on push state rather than inheriting the
// previous inspector's opt-out.
const PUSH_OPT_OUT_KEY = 'properfy.pwa.pushOptOut';

export const authStorage = {
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },

  clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    try {
      localStorage.removeItem(APP_STATE_HEARTBEAT_KEY);
      localStorage.removeItem(TOUR_PENDING_KEY);
      localStorage.removeItem(PUSH_OPT_OUT_KEY);
    } catch {
      /* storage unavailable — nothing to clear */
    }
  },

  hasTokens(): boolean {
    return !!localStorage.getItem(ACCESS_TOKEN_KEY);
  },
};
