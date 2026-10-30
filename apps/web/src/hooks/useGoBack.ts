import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Returns a back-button handler that is safe when the page was opened directly (fresh tab,
 * refresh of a first entry, direct link, or an entry reached only through login/redirect).
 *
 * "Is there in-app history to pop?" is decided by `window.history.state.idx`, the monotonic
 * index React Router's data router writes into history state: `0` for the first entry,
 * preserved by `replace`, incremented by `push`. So `idx > 0` means the user arrived here by
 * an in-app push and `navigate(-1)` has somewhere to go; `idx === 0` means this is the first
 * entry and we must navigate to `fallbackPath` instead.
 *
 * This replaces the older `location.key !== 'default'` criterion, which was wrong under React
 * Router 6.28: every `replace` mints a fresh `key`, so after any `replace` (a login/redirect
 * `<Navigate replace>`, a URL-filter write, a drawer close, a tab switch) the key was no longer
 * `'default'` and the handler wrongly called `navigate(-1)` — a silent no-op in a fresh tab, or
 * an exit from the app when the tab came from another site.
 *
 * `location.key` is kept only as a fallback for routers that do not write `idx`
 * (`MemoryRouter`/`createMemoryRouter` in tests), where `'default'` still marks the first entry.
 */
export function useGoBack(fallbackPath: string) {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    const hasAppHistory = typeof idx === 'number' ? idx > 0 : location.key !== 'default';

    if (hasAppHistory) {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  }, [location.key, navigate, fallbackPath]);
}
