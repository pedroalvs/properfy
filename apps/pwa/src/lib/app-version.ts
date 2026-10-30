/**
 * Builds the human-readable app version shown in the App settings footer and
 * reported by the app-state heartbeat: the package version plus a short build SHA.
 *
 * `sha` comes from `APP_BUILD_SHA` (injected by CI from `github.sha`); when it is
 * absent — a local build — the suffix is `dev`. The `+<7 chars>` suffix adds at
 * most 8 characters, staying well within the 40-char cap the API enforces on
 * `appVersion`.
 *
 * Pure and dependency-free so it can be imported by both `vite.config.ts` (and the
 * Vitest config it shares) and a unit test without pulling in Vite internals.
 * Lives in `src/lib/` (not `build/`, which is a globally git-ignored build-output
 * directory) so it is tracked and ships in the commit.
 */
export function buildAppVersion(pkgVersion: string, sha?: string): string {
  return `${pkgVersion}+${(sha ?? 'dev').slice(0, 7)}`;
}
