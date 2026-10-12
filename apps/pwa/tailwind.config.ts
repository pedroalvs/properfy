import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

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
        // `secondary` + `accent` now use the validated shadcn HSL surfaces (the auth
        // heading consumers that relied on the legacy teal ink moved to `foreground`/
        // `primary` in PR B, so remapping these to light surfaces is safe).
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
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
      },
      /**
       * Tailwind's default scale is 0,5,…,100, and `asColor()` drops any utility whose
       * alpha is off it — *before* it even looks at the colour. On literal colours
       * (the six `bg-white/92` profile cards, which rendered as bare outlines) that scale
       * is the only thing between the class and a working rule, so the token helper above
       * cannot save them.
       * These are the off-default steps this app's source actually uses;
       * `src/__tests__/opacity-scale.test.ts` fails if a new off-scale alpha appears in
       * the source.
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
