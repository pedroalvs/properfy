import { describe, expect, it } from 'vitest';

import { requireScopeIfMachine } from '../../../src/shared/interfaces/require-scope-if-machine';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeRequest(authContext: unknown) {
  return { authContext } as any;
}

describe('requireScopeIfMachine', () => {
  const guard = requireScopeIfMachine('bot:mail');

  it('allows a machine principal carrying the scope', async () => {
    await expect(
      guard(makeRequest({ userId: 'api-key:k-1', role: 'OP', scopes: ['bot:mail'] }), {} as any),
    ).resolves.toBeUndefined();
  });

  it('rejects a machine key missing the scope', async () => {
    await expect(
      guard(makeRequest({ userId: 'api-key:k-1', role: 'OP', scopes: ['bot:fy'] }), {} as any),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      guard(makeRequest({ userId: 'api-key:k-1', role: 'OP', scopes: [] }), {} as any),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets a human JWT principal through unchanged (never carries scopes)', async () => {
    await expect(
      guard(makeRequest({ userId: 'u-1', role: 'AM', tenantId: null }), {} as any),
    ).resolves.toBeUndefined();
    await expect(
      guard(makeRequest({ userId: 'u-2', role: 'CL_ADMIN', tenantId: 't-1' }), {} as any),
    ).resolves.toBeUndefined();
  });

  it('does not block an absent auth context (the auth middleware runs first)', async () => {
    await expect(guard(makeRequest(undefined), {} as any)).resolves.toBeUndefined();
  });
});
