import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: { tsconfig: 'tsconfig.build.json' },
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
