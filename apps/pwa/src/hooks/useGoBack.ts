import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Returns a back-button handler that reliably reaches the logical parent screen.
 *
 * When real in-app history exists (`location.key !== 'default'`) it pops that entry
 * (`navigate(-1)`), so "back" matches the route the user actually came from. On a cold
 * or direct load (fresh tab, deep link, standalone PWA launch) there is nothing to pop,
 * so it falls back to `fallbackPath` — the screen's declared logical parent.
 *
 * `location.key` is React Router's SPA-scoped marker. Unlike `window.history.state.idx`
 * it is not polluted by raw browser-history entries and behaves consistently under both
 * `createBrowserRouter` (prod) and `MemoryRouter` (tests). The fallback uses `replace`
 * so a deep-linked screen does not leave a dangling forward entry behind it.
 */
export function useGoBack(fallbackPath: string) {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(fallbackPath, { replace: true });
    }
  }, [location.key, navigate, fallbackPath]);
}
