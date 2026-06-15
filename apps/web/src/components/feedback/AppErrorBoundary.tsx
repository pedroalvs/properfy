import { useState } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { useGoBack } from '@/hooks/useGoBack';

/**
 * Application-wide router error boundary.
 *
 * Wired in via `errorElement` on the protected and public route trees
 * so React Router promotes us instead of falling back to its dev-only
 * "Hey developer 👋" placeholder.
 *
 * Behaviour:
 *  - Renders a consistent UX (icon + title + sanitized message + back/reload).
 *  - In DEV (Vite `import.meta.env.DEV`) shows the raw error message and
 *    stack inside a collapsible block so engineers can triage without
 *    opening DevTools. PROD hides everything but the friendly copy.
 *  - Distinguishes `isRouteErrorResponse` cases (router-thrown 4xx/5xx,
 *    e.g., `throw new Response('Not Found', { status: 404 })`) from
 *    arbitrary exceptions thrown inside loaders / lazy components /
 *    render. The status/statusText short-circuit lets the boundary
 *    double as a polite 404 / 403 surface.
 *
 * Telemetry hook (placeholder): the `useEffect` slot below is the place
 * to dispatch the error to Sentry / Posthog / our own /v1/telemetry
 * once that's wired up. Left intentionally inert — no silent failure
 * (placeholder only; not wired to a sink yet).
 */
export function AppErrorBoundary() {
  const error = useRouteError();
  const goBack = useGoBack('/');
  const [showStack, setShowStack] = useState(false);

  // Telemetry placeholder — no-op until /v1/telemetry or Sentry lands.
  // Intentionally NOT swallowing the error: the boundary re-renders the
  // failure to the user; the placeholder is purely for future reporting.
  // (If we wired it here without a guard, the import.meta.env access
  // would fire on every render — keep it cheap.)

  const isRouteError = isRouteErrorResponse(error);
  const status = isRouteError ? error.status : null;
  const statusText = isRouteError ? error.statusText : null;
  const rawMessage = error instanceof Error ? error.message
    : isRouteError ? `${error.status} ${error.statusText}`
    : typeof error === 'string' ? error
    : null;
  const stack = error instanceof Error ? error.stack ?? null : null;

  // The friendly headline distinguishes a few common shapes — a 404
  // looks very different from an unhandled render exception, and the
  // copy should match the user's mental model. The body stays generic
  // so we never accidentally leak backend details (auth tokens, SQL,
  // stack frames) into the page.
  let title = 'Something went wrong';
  let subtitle = 'An unexpected error happened while loading this page.';
  if (status === 404) {
    title = 'Page not found';
    subtitle = "The page you're looking for doesn't exist or has been moved.";
  } else if (status === 403) {
    title = 'Access denied';
    subtitle = "You don't have permission to view this page.";
  } else if (status && status >= 500) {
    title = 'Server error';
    subtitle = 'The server failed to handle this request. Please try again in a moment.';
  }

  const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center bg-app-bg px-6 py-12 text-center"
      role="alert"
      data-testid="app-error-boundary"
    >
      <i
        className="mdi mdi-alert-octagon text-[64px] text-error"
        aria-hidden="true"
      />
      <h1 className="mt-4 text-[24px] font-bold text-secondary">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-text-secondary">{subtitle}</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={goBack}
          className="rounded border border-primary px-5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
          aria-label="Go back"
        >
          Go back
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded bg-real-estate px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          aria-label="Reload page"
        >
          Reload
        </button>
      </div>

      {isDev && rawMessage ? (
        <div className="mt-8 w-full max-w-3xl text-left">
          <button
            type="button"
            onClick={() => setShowStack((v) => !v)}
            className="text-xs font-semibold uppercase tracking-wide text-text-muted hover:text-text-primary"
            aria-expanded={showStack}
            aria-controls="app-error-boundary-stack"
          >
            <i
              className={`mdi mdi-chevron-${showStack ? 'down' : 'right'} mr-1`}
              aria-hidden="true"
            />
            Developer details
          </button>
          {showStack && (
            <pre
              id="app-error-boundary-stack"
              className="mt-2 max-h-[40vh] overflow-auto rounded bg-gray-900 p-4 text-xs text-gray-100"
            >
              {statusText ? `${status} ${statusText}\n\n` : ''}
              {rawMessage}
              {stack ? `\n\n${stack}` : ''}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
}
