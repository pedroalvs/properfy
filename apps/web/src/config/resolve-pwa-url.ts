/**
 * Resolves the Properfy Inspector app (PWA) URL that the web login points
 * inspectors to.
 *
 * Why derive it instead of reading a per-environment build var from the deploy
 * workflow: `frontend-deploy.yml` runs on `workflow_run`, and on that trigger
 * GitHub always uses the workflow file from the DEFAULT branch (main). So a build
 * var added only to develop's workflow would be EMPTY in DEV/staging until it
 * reaches main. The one var that is reliably baked per environment today is
 * `VITE_API_BASE_URL` (set in main's workflow) — the same mechanism that already
 * gives each environment its API URL. We map that API host to the matching app
 * URL. An explicit `VITE_PWA_URL` (e.g. a local, uncommitted `.env`) always wins,
 * for local development and as an escape hatch.
 *
 * Resolution matrix (after the override):
 * - API host is one of the known published hosts → the mapped app URL.
 * - API host is LOCAL (localhost / 127.0.0.1 / ::1) or the API URL is absent →
 *   the local PWA dev server (dev convenience).
 * - API host is published but UNKNOWN (not in the map), or the URL is malformed
 *   (and not clearly local) → `''`. An empty value makes the modal render a
 *   DISABLED "Open the app" button — never a broken localhost link in a published
 *   environment.
 */

/** API host (as deployed per environment) → the matching Inspector app URL. */
const API_HOST_TO_PWA_URL: Record<string, string> = {
  'properfy-api-dev.fly.dev': 'https://pwa-properfy.pedroalvs.com',
  'api-properfy.autolabs.tech': 'https://pwa-properfy.autolabs.tech',
  'api.properfy.me': 'https://pwa.properfy.me',
};

/** Local PWA dev server — used only for a local/absent API host. */
export const PWA_URL_DEV_FALLBACK = 'http://localhost:5174';

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

/**
 * @param override   `import.meta.env.VITE_PWA_URL` — wins when set (local dev).
 * @param apiBaseUrl `import.meta.env.VITE_API_BASE_URL` — the per-env API URL.
 * @returns the app URL, or `''` for an unknown published host (→ disabled button).
 */
export function resolvePwaUrl(
  override: string | undefined,
  apiBaseUrl: string | undefined,
): string {
  const trimmedOverride = override?.trim();
  if (trimmedOverride) return trimmedOverride;

  // Absent/empty API URL → local dev convenience.
  if (!apiBaseUrl || !apiBaseUrl.trim()) return PWA_URL_DEV_FALLBACK;

  let url: URL;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    // Malformed and not clearly local → unknown → disabled button.
    return '';
  }

  // Local host → dev server (dev convenience).
  if (isLocalHostname(url.hostname)) return PWA_URL_DEV_FALLBACK;

  // Known published host → its app URL.
  const mapped = API_HOST_TO_PWA_URL[url.host];
  if (mapped) return mapped;

  // Published but unknown → disabled button (never a broken localhost link).
  return '';
}
