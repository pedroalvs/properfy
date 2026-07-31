import type { Config } from 'tailwindcss';

const NUMERIC_ALPHA = /^\d+(\.\d+)?$/;

/**
 * Design tokens are `var(--color-X)` holding a hex or rgba literal. Tailwind cannot
 * decompose that into channels, so `parseColor()` returns null and every `bg-X/N`,
 * `text-X/N`, `border-X/N` and `ring-X/N` is discarded with no warning — 253 usages
 * across this app and `apps/pwa` had never rendered a pixel (#1041).
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
 * Keep this identical to the copy in `apps/pwa/tailwind.config.ts` — the parity test in
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
      // 0.55 * 100 === 55.00000000000001 in IEEE-754, and both 0.55 and 0.14 are in use.
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

    // `/[var(--x)]`, `/[calc(…)]` — defer the multiply to the browser; Number() would
    // give NaN% here.
    return `color-mix(in srgb, ${color} calc(${alpha} * 100%), transparent)`;
  }) as unknown) as string;

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: {
      mobile: { max: '639px' },
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        primary: token('primary'),
        secondary: token('secondary'),
        accent: token('accent'),
        error: token('error'),
        info: token('info'),
        success: token('success'),
        warning: token('warning'),
        realty: token('realty'),
        'real-estate': token('real-estate'),
        'app-bg': token('app-bg'),
        'card-bg': token('card-bg'),
        'text-primary': token('text-primary'),
        'text-secondary': token('text-secondary'),
        'text-muted': token('text-muted'),
        'text-disabled': token('text-disabled'),
        'status-draft': token('status-draft'),
        'status-awaiting': token('status-awaiting-inspector'),
        'status-scheduled': token('status-scheduled'),
        'status-done': token('status-done'),
        'status-cancelled': token('status-cancelled'),
        'status-rejected': token('status-rejected'),
        'snackbar-error': token('snackbar-error'),
        'shimmer-from': token('shimmer-from'),
        'shimmer-via': token('shimmer-via'),
        'shimmer-to': token('shimmer-to'),
        'border-subtle': token('border-subtle'),
        'border-light': token('border-light'),
        'hover-row': token('hover-row'),
        'text-inactive': token('text-inactive'),
        'btn-secondary-bg': token('btn-secondary-bg'),
        'btn-secondary-hover': token('btn-secondary-hover'),
        'btn-secondary-active': token('btn-secondary-active'),
      },
      /**
       * Tailwind's default scale is 0,5,…,100, and `asColor()` drops any utility whose
       * alpha is off it — *before* it even looks at the colour. On literal colours
       * (`bg-white/6` and `text-white/88` in the login hero) that scale is the only thing
       * between the class and a working rule, so the token helper above cannot save them.
       * These are the steps this app actually uses; `src/__tests__/opacity-scale.test.ts`
       * fails if a new one appears.
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
        nunito: ['Nunito', 'sans-serif'],
        poppins: ['Poppins', 'sans-serif'],
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
        sidebar: '75px',
        'page-x': '32px',
        'page-y': '24px',
      },
      animation: {
        shimmer: 'shimmer 1.5s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      borderRadius: {
        DEFAULT: '4px',
        submenu: '6px',
      },
      width: {
        sidebar: '75px',
        'drawer-narrow': '480px',
        'drawer-wide': '970px',
      },
    },
  },
  plugins: [],
};

export default config;
