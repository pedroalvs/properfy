const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
// Mirror of APP_STATE_HEARTBEAT_KEY in app/useAppStateHeartbeat.ts. Inlined (not
// imported) to avoid an api → auth-storage → heartbeat → api import cycle. Cleared
// on logout so the next inspector on a shared device beats immediately.
const APP_STATE_HEARTBEAT_KEY = 'properfy.pwa.appStateHeartbeat';

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
    } catch {
      /* storage unavailable — nothing to clear */
    }
  },

  hasTokens(): boolean {
    return !!localStorage.getItem(ACCESS_TOKEN_KEY);
  },
};
