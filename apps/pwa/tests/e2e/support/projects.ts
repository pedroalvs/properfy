import { test, type TestInfo } from '@playwright/test';

/**
 * The SOLE source of per-project restriction. Project names are a contract: the 4
 * projects in `playwright.config.ts` are `Mobile Safari`, `Mobile Chrome`,
 * `Tablet (iPad portrait)` and `Foldable open`. All 4 set `isMobile: true`, so
 * `test.skip(({ isMobile }) => …)` distinguishes NOTHING. A spec must never derive
 * layout from `viewport.width`, `isMobile`, or `project.name` directly — it calls
 * these helpers (L-X03-07). Renaming a project = updating `WIDE_PROJECTS`.
 */
export const WIDE_PROJECTS = ['Tablet (iPad portrait)', 'Foldable open'] as const;

/** The two wide projects render the adaptive 2-column (two-pane) layout (≥ md). */
export function isWideProject(testInfo: TestInfo): boolean {
  return (WIDE_PROJECTS as readonly string[]).includes(testInfo.project.name);
}

/** WebKit projects (`Mobile Safari`, `Tablet`) — for the WebKit-only `test.fixme` rule. */
export function isWebKitProject(testInfo: TestInfo): boolean {
  const use = testInfo.project.use as { browserName?: string; defaultBrowserType?: string };
  return use.browserName === 'webkit' || use.defaultBrowserType === 'webkit';
}

/** Skip the current test on the two wide projects. `reason` is mandatory. Call inside a test. */
export function skipOnWide(reason: string): void {
  if (!reason.trim()) throw new Error('skipOnWide requires a non-empty reason');
  test.skip(isWideProject(test.info()), reason);
}

/** Skip the current test on the two phone projects. `reason` is mandatory. Call inside a test. */
export function skipOnPhone(reason: string): void {
  if (!reason.trim()) throw new Error('skipOnPhone requires a non-empty reason');
  test.skip(!isWideProject(test.info()), reason);
}
