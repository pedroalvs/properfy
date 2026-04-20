import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/main/server.ts',
    // Operational script: bundled so it ships inside the production image
    // without pulling tsx into prod deps. Runs via
    //   `node dist/provision-qa-users.js`
    // as part of the Fly.io release_command chain.
    'prisma/provision-qa-users.ts',
  ],
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
