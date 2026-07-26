/**
 * The backfill only ever runs in production as the **bundled** entrypoint
 * (`dist/backfill-property-branch.js`, a tsup entry). A guard that recognises
 * only the `.ts` source makes the whole script a silent no-op there: it exits
 * 0, prints nothing, repairs nothing — the worst possible failure for a repair
 * you run once and trust.
 */
import { describe, it, expect } from 'vitest';
import { isDirectInvocation } from './backfill-property-branch';

describe('backfill-property-branch entrypoint guard', () => {
  it('runs as the bundled production entrypoint', () => {
    expect(isDirectInvocation('/app/apps/backend/dist/backfill-property-branch.js')).toBe(true);
  });

  it('runs from the TypeScript source (local tsx run)', () => {
    expect(isDirectInvocation('/repo/apps/backend/src/scripts/backfill-property-branch.ts')).toBe(true);
  });

  it('stays inert when the module is merely imported', () => {
    // What `process.argv[1]` looks like under vitest, and when another script
    // imports `backfillPropertyBranch` as a library.
    expect(isDirectInvocation('/repo/node_modules/vitest/vitest.mjs')).toBe(false);
    expect(isDirectInvocation('/app/apps/backend/dist/server.js')).toBe(false);
    expect(isDirectInvocation(undefined)).toBe(false);
  });

  it('does not match a lookalike filename', () => {
    // Anchored on both sides: a path separator before the name, the extension
    // at the end — so neither a suffixed nor a prefixed sibling triggers it.
    expect(isDirectInvocation('/app/dist/backfill-property-branch-v2.js')).toBe(false);
    expect(isDirectInvocation('/app/dist/my-backfill-property-branch.js')).toBe(false);
  });
});
