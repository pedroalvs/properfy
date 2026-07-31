import { describe, it, expect, vi } from 'vitest';
import { retryOnUniqueConflict } from '../../../src/shared/domain/retry-on-unique-conflict';

function uniqueViolation(target: string | string[]) {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target },
  });
}

describe('retryOnUniqueConflict', () => {
  it('returns the result without retrying when the work succeeds', async () => {
    const work = vi.fn().mockResolvedValue('ok');

    await expect(retryOnUniqueConflict('token_hash', work)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('re-runs the work after a conflict on the watched column', async () => {
    const work = vi
      .fn()
      .mockRejectedValueOnce(uniqueViolation('token_hash'))
      .mockResolvedValue('ok');

    await expect(retryOnUniqueConflict('token_hash', work)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('accepts a composite target that includes the watched column', async () => {
    const work = vi
      .fn()
      .mockRejectedValueOnce(uniqueViolation(['appointment_id', 'token_hash']))
      .mockResolvedValue('ok');

    await expect(retryOnUniqueConflict('token_hash', work)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('gives up and rethrows once the attempts are exhausted', async () => {
    const error = uniqueViolation('token_hash');
    const work = vi.fn().mockRejectedValue(error);

    await expect(retryOnUniqueConflict('token_hash', work, 3)).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(3);
  });

  // Retrying a conflict on some other column would mint a fresh token and hide a
  // real bug — an id collision or a duplicated confirmation cycle must surface.
  it('does not retry a unique conflict on a different column', async () => {
    const error = uniqueViolation('portal_token_id');
    const work = vi.fn().mockRejectedValue(error);

    await expect(retryOnUniqueConflict('token_hash', work)).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('does not retry a unique conflict with no target metadata', async () => {
    const error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    const work = vi.fn().mockRejectedValue(error);

    await expect(retryOnUniqueConflict('token_hash', work)).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a non-conflict Prisma error', Object.assign(new Error('nope'), { code: 'P2025' })],
    ['a plain error', new Error('boom')],
    ['a non-object rejection', 'boom'],
  ])('does not retry %s', async (_label, error) => {
    const work = vi.fn().mockRejectedValue(error);

    await expect(retryOnUniqueConflict('token_hash', work)).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(1);
  });
});
