import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
        error: 'var(--color-error)',
        info: 'var(--color-info)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        realty: 'var(--color-realty)',
        'real-estate': 'var(--color-real-estate)',
        'app-bg': 'var(--color-app-bg)',
        'card-bg': 'var(--color-card-bg)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        'text-disabled': 'var(--color-text-disabled)',
        'status-draft': 'var(--color-status-draft)',
        'status-awaiting': 'var(--color-status-awaiting-inspector)',
        'status-scheduled': 'var(--color-status-scheduled)',
        'status-done': 'var(--color-status-done)',
        'status-cancelled': 'var(--color-status-cancelled)',
        'status-rejected': 'var(--color-status-rejected)',
      },
      fontFamily: {
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
        sidebar: '75px',
        'page-x': '32px',
        'page-y': '24px',
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
