import { describe, expect, it } from 'vitest';

import { requireScope } from '../../../src/shared/interfaces/require-scope';
import { ForbiddenError } from '../../../src/shared/domain/errors';

function makeRequest(authContext: unknown) {
  return { authContext } as any;
}

describe('requireScope', () => {
  const guard = requireScope('bot:fy');

  it('allows a machine principal carrying the scope', async () => {
    await expect(
      guard(makeRequest({ userId: 'api-key:k-1', role: 'OP', scopes: ['bot:fy'] }), {} as any),
    ).resolves.toBeUndefined();
  });

  it('rejects a key without the scope', async () => {
    await expect(
      guard(makeRequest({ userId: 'api-key:k-1', role: 'OP', scopes: [] }), {} as any),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects JWT principals (no scopes) — scoped routes are machine-only', async () => {
    await expect(
      guard(makeRequest({ userId: 'u-1', role: 'AM', tenantId: null }), {} as any),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects unauthenticated requests', async () => {
    await expect(guard(makeRequest(undefined), {} as any)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
