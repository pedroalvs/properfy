import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main/server.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  // Bundle everything except node_modules externals
  noExternal: [/@properfy\/shared/],
  // Don't bundle node_modules (prisma, fastify, etc.)
  external: [
    /^[^./]/,  // everything not starting with . or /
  ],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});
