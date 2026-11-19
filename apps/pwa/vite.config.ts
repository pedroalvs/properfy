import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { readFileSync } from 'fs';
import { buildAppVersion } from './src/lib/app-version';

// Read the package version at config-eval time (Node). APP_BUILD_SHA is injected
// by CI (github.sha); it is read here in Node, never exposed via import.meta.env,
// so it must NOT carry a VITE_ prefix. The same `define` applies to the inline
// Vitest config below, so __APP_VERSION__ resolves in unit tests too.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version: string };
const appVersion = buildAppVersion(pkg.version, process.env.APP_BUILD_SHA);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      includeAssets: ['icons/favicon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon-180.png'],
      manifest: {
        name: 'Properfy Inspector',
        short_name: 'Properfy',
        description: 'Properfy Inspector Mobile App',
        theme_color: '#2563EB',
        background_color: '#F6F7F9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/schedule',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    css: true,
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
