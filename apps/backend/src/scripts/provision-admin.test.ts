/**
 * Entrypoint-guard tests for provision-admin — same contract as the other
 * bundled one-shots: runs from dist/ and from tsx source, inert when imported.
 */
import { describe, it, expect } from 'vitest';
import { isDirectInvocation } from './provision-admin';

describe('provision-admin entrypoint guard', () => {
  it('runs as the bundled production entrypoint', () => {
    expect(isDirectInvocation('/app/apps/backend/dist/provision-admin.js')).toBe(true);
  });

  it('runs from the TypeScript source (local tsx run)', () => {
    expect(isDirectInvocation('/repo/apps/backend/src/scripts/provision-admin.ts')).toBe(true);
  });

  it('stays inert when the module is merely imported', () => {
    expect(isDirectInvocation('/repo/node_modules/vitest/vitest.mjs')).toBe(false);
    expect(isDirectInvocation('/app/apps/backend/dist/server.js')).toBe(false);
    expect(isDirectInvocation(undefined)).toBe(false);
  });

  it('does not match a lookalike filename', () => {
    expect(isDirectInvocation('/app/dist/provision-admin-v2.js')).toBe(false);
    expect(isDirectInvocation('/app/dist/my-provision-admin.js')).toBe(false);
  });
});
