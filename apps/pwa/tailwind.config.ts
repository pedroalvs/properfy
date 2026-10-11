import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const NUMERIC_ALPHA = /^\d+(\.\d+)?$/;
const PERCENT_ALPHA = /^\d+(\.\d+)?%$/;

/**
 * Design tokens are `var(--color-X)` holding a hex or rgba literal. Tailwind cannot
 * decompose that into channels, so `parseColor()` returns null and every `bg-X/N`,
 * `text-X/N`, `border-X/N` and `ring-X/N` is discarded with no warning — 253 usages
 * across this app and `apps/web` had never rendered a pixel (#1041).
 *
 * A *function* colour is the escape hatch: Tailwind hands it the alpha it wants and uses
 * whatever comes back. Four call sites in tailwindcss 3.4.19, and the last one is easy to
 * miss because it is the only one that passes a number:
 *
 *   util/toColorValue.js        fn({})                                 fill, stroke, caret, …
 *   util/withAlphaVariable.js   fn({ opacityVariable, opacityValue })  plain bg/text/border
 *   util/pluginUtils.js         fn({ opacityValue }) via asColor       the `/N` modifier
 *   corePlugins gradientColorStops -> withAlphaValue(value, 0)         the NUMBER 0
 *
 * Tailwind's `Config` type declares colours as strings; the function form is runtime
 * behaviour the types never caught up with, hence the cast.
 *
 * Keep this identical to the copy in `apps/web/tailwind.config.ts` — the parity test in
 * `apps/web/src/__tests__/tailwind-config-parity.test.ts` fails if the two drift.
 */
type AlphaArgs = { opacityValue?: string | number; opacityVariable?: string };

const token = (cssVar: string): string =>
  ((({ opacityValue, opacityVariable }: AlphaArgs = {}) => {
    const color = `var(--color-${cssVar})`;

    // No modifier. Tailwind passed nothing, or its own `--tw-*-opacity` var — which an
    // opaque token literal could never honour anyway, exactly as today. Emit the token
    // verbatim so nothing that already works changes.
    if (opacityValue === undefined || opacityVariable !== undefined) return color;

    const alpha = String(opacityValue);
    if (NUMERIC_ALPHA.test(alpha)) {
      // Defensive: 0.55 * 100 === 55.00000000000001 in IEEE-754. No token currently uses
      // an alpha that reproduces it (the /55 and /14 in the tree sit on literal white and
      // never reach this function), but a raw multiply would emit that as a percentage.
      const pct = Math.round(Number(alpha) * 1e6) / 1e4;
      // A gradient's transparent end. The keyword keeps that (currently working)
      // declaration valid without color-mix support; a color-mix inside
      // `--tw-gradient-to` would invalidate the entire linear-gradient there.
      if (pct === 0) return 'transparent';
      // color-mix at 100% is the colour itself; skip the indirection.
      if (pct === 100) return color;
      // For tokens that already carry alpha (`--color-text-*`), color-mix MULTIPLIES:
      // `text-text-secondary/65` over rgba(0,0,0,.6) yields alpha .39. That is the
      // intuitive reading of an opacity modifier — and no such usage exists today.
      return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
    }

    // `/[37%]` — the arbitrary form Tailwind's own docs use. It is already a percentage,
    // so it drops straight in. Sending it through the calc() branch below would emit
    // `calc(37% * 100%)`, which is invalid (calc cannot multiply two percentages), and the
    // browser discards the declaration — silently recreating the exact bug this helper
    // exists to fix. `bg-white/[37%]` works natively, so without this the token path would
    // be strictly worse than the literal one.
    if (PERCENT_ALPHA.test(alpha)) return `color-mix(in srgb, ${color} ${alpha}, transparent)`;

    // `/[var(--x)]`, `/[calc(…)]` — defer the multiply to the browser; Number() would
    // give NaN% here.
    return `color-mix(in srgb, ${color} calc(${alpha} * 100%), transparent)`;
  }) as unknown) as string;

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // shadcn / validated design-system colors — HSL channels + native /opacity.
        // These reuse the brand names (primary/secondary/accent/success) with the new
        // validated values; brand-colored elements on not-yet-migrated screens shift to
        // the new look immediately, then get refined per-screen in later PRs.
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        // `secondary` + `accent` stay on the LEGACY brand values (dark teal #21566E /
        // #41A69D): ~20 not-yet-migrated screens use `text-secondary` as a heading
        // colour, so remapping them to a light shadcn surface made those headings
        // invisible. New primitives use `muted`/`primary` for surfaces instead.
        secondary: token('secondary'),
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: token('accent'),
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
        },
        warning: 'hsl(var(--warning) / <alpha-value>)',
        'warning-foreground': 'hsl(var(--warning-foreground) / <alpha-value>)',
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        'pill-green': { DEFAULT: 'hsl(var(--pill-green-bg) / <alpha-value>)', foreground: 'hsl(var(--pill-green-fg) / <alpha-value>)' },
        'pill-amber': { DEFAULT: 'hsl(var(--pill-amber-bg) / <alpha-value>)', foreground: 'hsl(var(--pill-amber-fg) / <alpha-value>)' },
        'pill-blue': { DEFAULT: 'hsl(var(--pill-blue-bg) / <alpha-value>)', foreground: 'hsl(var(--pill-blue-fg) / <alpha-value>)' },
        'pill-red': { DEFAULT: 'hsl(var(--pill-red-bg) / <alpha-value>)', foreground: 'hsl(var(--pill-red-fg) / <alpha-value>)' },
        'pill-gray': { DEFAULT: 'hsl(var(--pill-gray-bg) / <alpha-value>)', foreground: 'hsl(var(--pill-gray-fg) / <alpha-value>)' },
        // Legacy domain tokens consumed via inline `style` in `src/lib/status-colors.ts`
        // (status/sg/confirmation/flow + text-*). These remain function colours so their
        // `/opacity` utilities keep working; see the `token()` helper above.
        'text-primary': token('text-primary'),
        'text-secondary': token('text-secondary'),
        'text-muted': token('text-muted'),
        'status-draft': token('status-draft'),
        'status-awaiting': token('status-awaiting-inspector'),
        'status-scheduled': token('status-scheduled'),
        'status-done': token('status-done'),
        'status-cancelled': token('status-cancelled'),
        'status-rejected': token('status-rejected'),
      },
      /**
       * Tailwind's default scale is 0,5,…,100, and `asColor()` drops any utility whose
       * alpha is off it — *before* it even looks at the colour. On literal colours
       * (the six `bg-white/92` profile cards, which rendered as bare outlines) that scale
       * is the only thing between the class and a working rule, so the token helper above
       * cannot save them.
       * This is the UNION of the steps both apps use — the parity test requires the two
       * configs to match, and each needs only a subset (web never uses 4/14/92, pwa never
       * uses 6/12/78/88). `src/__tests__/opacity-scale.test.ts` fails if a new one appears
       * in this app's source.
       */
      opacity: {
        4: '0.04',
        6: '0.06',
        8: '0.08',
        12: '0.12',
        14: '0.14',
        78: '0.78',
        88: '0.88',
        92: '0.92',
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        nunito: ['Nunito', 'sans-serif'],
      },
      fontSize: {
        'page-title': ['24px', { lineHeight: '32px', fontWeight: '700' }],
        'page-title-mobile': ['20px', { lineHeight: '28px', fontWeight: '700' }],
        'dialog-title': ['20px', { lineHeight: '28px', fontWeight: '500' }],
        'table-header': ['14px', { lineHeight: '20px', fontWeight: '700' }],
        'table-body': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        tabs: ['14px', { lineHeight: '20px', fontWeight: '700' }],
        caption: ['12px', { lineHeight: '16px', fontWeight: '400' }],
      },
      spacing: {
        'page-x': '16px',
        'page-y': '16px',
        // iOS home-indicator inset; see --safe-area-bottom in styles/tokens.css. Use the
        // bare token where the element has no padding-bottom of its own, and the `-6`
        // variant where it does — the inset has to stack on top of the existing padding,
        // not replace it. Because the inset is dead space, adding it leaves the *visible*
        // spacing unchanged on devices without an indicator.
        'safe-b': 'var(--safe-area-bottom)',
        'safe-b-6': 'calc(1.5rem + var(--safe-area-bottom))',
        // Clearance for content sitting under the fixed bottom nav, plus the inset the
        // bar pads itself with. The 5rem base is 80px: the 68px rendered bar plus 12px of
        // slack, carried over from the `pb-20` this replaced. Keep the base >= the bar's
        // height; do not "correct" it down to 68px, that would delete the slack.
        'nav-clear': 'calc(5rem + var(--safe-area-bottom))',
      },
      borderRadius: {
        DEFAULT: '4px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: '1.125rem',
        btn: 'var(--radius)',
      },
      minHeight: {
        'touch': '44px',
      },
      minWidth: {
        'touch': '44px',
      },
    },
  },
  plugins: [animate],
};

export default config;
