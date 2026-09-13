import { describe, it, expect, vi } from 'vitest';
import { retryOnUniqueConflict } from './retry-on-unique-conflict';

function p2002(target: string | string[]) {
  return { code: 'P2002', meta: { target } };
}

describe('retryOnUniqueConflict', () => {
  it('retries a single-column conflict and eventually succeeds', async () => {
    const work = vi
      .fn()
      .mockRejectedValueOnce(p2002(['token_hash']))
      .mockResolvedValueOnce('ok');

    await expect(retryOnUniqueConflict('token_hash', work)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(2);
  });

  // WI-B2 (#1056): the array form whitelists more than one replayable column.
  it('retries when the conflict target includes any of the given columns', async () => {
    const work = vi
      .fn()
      .mockRejectedValueOnce(p2002(['appointment_id', 'cycle_number']))
      .mockResolvedValueOnce('ok');

    await expect(
      retryOnUniqueConflict(['token_hash', 'cycle_number'], work),
    ).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('still refuses a conflict on a column outside the whitelist', async () => {
    const err = p2002(['some_other_unique']);
    const work = vi.fn().mockRejectedValue(err);

    await expect(
      retryOnUniqueConflict(['token_hash', 'cycle_number'], work),
    ).rejects.toBe(err);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-P2002 error', async () => {
    const err = new Error('db down');
    const work = vi.fn().mockRejectedValue(err);

    await expect(
      retryOnUniqueConflict(['token_hash', 'cycle_number'], work),
    ).rejects.toBe(err);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('matches the string-form target reported by non-array connectors', async () => {
    const work = vi
      .fn()
      .mockRejectedValueOnce(p2002('cycle_number'))
      .mockResolvedValueOnce('ok');

    await expect(
      retryOnUniqueConflict(['token_hash', 'cycle_number'], work),
    ).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(2);
  });
});
