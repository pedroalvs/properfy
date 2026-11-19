import { describe, expect, it, vi } from 'vitest';
import { HasRecentSystemInspectorNoticeUseCase } from '../../../src/modules/inspector-notice/application/use-cases/has-recent-system-inspector-notice.use-case';

const SINCE = new Date('2026-11-03T00:00:00Z');

describe('HasRecentSystemInspectorNoticeUseCase', () => {
  it('delegates to the repository and returns its boolean', async () => {
    const repo = { existsSystemNoticeByDedupeKeyPrefixSince: vi.fn(async () => true) } as any;
    const out = await new HasRecentSystemInspectorNoticeUseCase(repo).execute({
      dedupeKeyPrefix: 'program-level:i1:',
      since: SINCE,
    });
    expect(out).toBe(true);
    expect(repo.existsSystemNoticeByDedupeKeyPrefixSince).toHaveBeenCalledWith('program-level:i1:', SINCE);
  });

  it('rejects an empty or over-long prefix (caller bug)', async () => {
    const repo = { existsSystemNoticeByDedupeKeyPrefixSince: vi.fn() } as any;
    const useCase = new HasRecentSystemInspectorNoticeUseCase(repo);
    await expect(useCase.execute({ dedupeKeyPrefix: '', since: SINCE })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(useCase.execute({ dedupeKeyPrefix: 'x'.repeat(201), since: SINCE })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.existsSystemNoticeByDedupeKeyPrefixSince).not.toHaveBeenCalled();
  });
});
