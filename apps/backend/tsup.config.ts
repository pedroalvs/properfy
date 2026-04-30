import { defineConfig } from 'tsup';

export default defineConfig({
  // Object entries pin output names so we keep `dist/server.js` flat at
  // the root (the path expected by the Dockerfile `CMD`). Adding the
  // provision script as a second entry without this map would relocate
  // the server bundle to `dist/src/main/server.js` and crash-loop the
  // Fly.io machines on boot (the failure mode that took staging down on
  // 2026-04-20T22:57Z).
  entry: {
    server: 'src/main/server.ts',
    // Operational script: bundled so it ships inside the production image
    // without pulling tsx into prod deps. Runs via
    //   `node dist/provision-qa-users.js`
    // as part of the Fly.io release_command chain.
    'provision-qa-users': 'prisma/provision-qa-users.ts',
    // One-shot prod seed: upserts platform-default notification templates.
    // Run once after first production deploy via:
    //   fly ssh console -a properfy-prod -C "cd /app && node apps/backend/dist/seed-platform-notification-templates.js"
    'seed-platform-notification-templates': 'src/scripts/seed-platform-notification-templates.ts',
  },
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
