import { buildApp } from '../main/server.js';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  const app = await buildApp();
  await app.ready();

  const spec = app.swagger();
  const outputPath = resolve(import.meta.dirname, '../../../../packages/shared/openapi.json');
  writeFileSync(outputPath, JSON.stringify(spec, null, 2));

  console.log(`OpenAPI spec written to ${outputPath}`);
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
