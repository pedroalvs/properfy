import { defineConfig } from 'tsup';

export default defineConfig({
  // `route-planning` is a second entry so the pure optimizer can be imported via
  // the `@properfy/shared/route-planning` subpath, keeping it out of consumers'
  // eager bundles (the PWA reorder recompute lives in a lazy route chunk).
  entry: ['src/index.ts', 'src/route-planning/index.ts'],
  format: ['cjs', 'esm'],
  dts: { tsconfig: 'tsconfig.build.json' },
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
