import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindConfig from '../../../../tailwind.config';

/**
 * Regression guard for the "bottom nav covers footer CTAs" class of bug (QA BUG-2).
 *
 * The bottom nav is `position: fixed`, so it does not occupy flow space — flow content
 * only clears it because `<main>` reserves `pb-nav-clear`. That clearance was introduced
 * in PR #1032; the QA report that flagged the overlap was measured against a pre-#1032
 * build (a stale deploy), and the overlap does not reproduce on the current shell.
 *
 * The failure mode is *silent*: `nav-clear` is `calc(<base> + var(--safe-area-bottom))`,
 * and if someone ever trims the base below the bar's rendered height, the last row of
 * content slides back under the tabs with no test, typecheck or lint catching it. The
 * `safe-area-tokens` suite guards that the token exists and carries the inset; this suite
 * guards the *numeric* half of the contract — the base must be at least the bar height —
 * plus the premises that make that math correct (the bar is fixed and pads itself once).
 */
const REM_PX = 16;

function lengthToPx(value: string): number {
  const rem = value.match(/([\d.]+)\s*rem/);
  if (rem) return parseFloat(rem[1]) * REM_PX;
  const px = value.match(/([\d.]+)\s*px/);
  if (px) return parseFloat(px[1]);
  throw new Error(`Unrecognised length: "${value}"`);
}

describe('bottom-nav clearance contract', () => {
  const spacing = (tailwindConfig.theme?.extend?.spacing ?? {}) as Record<string, string>;
  const minHeight = (tailwindConfig.theme?.extend?.minHeight ?? {}) as Record<string, string>;
  const navSource = readFileSync(resolve(__dirname, '../BottomNavBar.tsx'), 'utf8');
  const layoutSource = readFileSync(resolve(__dirname, '../PwaLayout.tsx'), 'utf8');

  it('the layout main reserves nav clearance', () => {
    // Same invariant PwaLayout.test asserts on the rendered DOM, kept here so the whole
    // contract reads in one place: without this class flow content has zero clearance.
    expect(layoutSource).toMatch(/<main[^>]*\bpb-nav-clear\b/);
  });

  it('the bottom nav is fixed, so flow content must reserve space for it', () => {
    expect(navSource).toContain('fixed bottom-0');
  });

  it('the bottom nav pads itself with the safe-area inset exactly once', () => {
    // nav-clear adds the inset once and the bar adds it once (pb-safe-b), so the two line
    // up. If the bar stopped padding the inset, the base-vs-height check below would be
    // measuring the wrong height.
    expect(navSource).toContain('pb-safe-b');
  });

  it('nav-clear base is at least the rendered bar height', () => {
    // Bar height budget, excluding the safe-area inset (both sides add that separately):
    //   NavLink min-h-touch + the grid container's py-2 (top + bottom) + the top border.
    // Assert the bar still uses each of these so the constants below stay honest.
    expect(navSource).toContain('min-h-touch');
    expect(navSource).toContain('py-2');
    expect(navSource).toContain('border-t');

    const navLinkMinHeight = lengthToPx(minHeight.touch ?? '44px');
    const containerVerticalPadding = 2 * 8; // py-2 → 0.5rem top + 0.5rem bottom
    const topBorder = 1; // border-t
    const barHeight = navLinkMinHeight + containerVerticalPadding + topBorder;

    const navClear = spacing['nav-clear'] ?? '';
    const base = navClear.match(/calc\(\s*([\d.]+\s*rem)/)?.[1];
    expect(base, `nav-clear should be calc(<base> + inset), got "${navClear}"`).toBeDefined();

    expect(lengthToPx(base!)).toBeGreaterThanOrEqual(barHeight);
  });
});
