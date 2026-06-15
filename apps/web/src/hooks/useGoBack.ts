import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Returns a back-button handler that is safe when the page was opened in a new tab.
 *
 * Detail/create pages are frequently opened via `window.open(..., '_blank')` or a
 * `target="_blank"` link. Such a tab starts with a history stack of length 1, so a
 * plain `navigate(-1)` (= `history.back()`) has nothing to pop and is a silent no-op.
 *
 * This handler navigates back only when in-app history exists
 * (`location.key !== 'default'`) and otherwise falls back to `fallbackPath`.
 *
 * `location.key === 'default'` is React Router's marker for the first entry of a
 * router session (fresh tab / direct load). It is scoped to the SPA navigation stack
 * — not the pollutable raw browser history — and behaves consistently under both
 * `createBrowserRouter` (prod) and `MemoryRouter` (tests).
 */
export function useGoBack(fallbackPath: string) {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  }, [location.key, navigate, fallbackPath]);
}
