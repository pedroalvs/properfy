import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { checkPasswordHistory } from '../../../src/modules/auth/application/helpers/check-password-history';
import type { IPasswordHistoryRepository } from '../../../src/modules/auth/domain/password-history.repository';

describe('checkPasswordHistory', () => {
  let repo: IPasswordHistoryRepository;

  beforeEach(() => {
    repo = {
      findRecentByUserId: vi.fn(),
      save: vi.fn(),
      pruneOldEntries: vi.fn(),
    };
  });

  it('should return false when history is empty', async () => {
    vi.mocked(repo.findRecentByUserId).mockResolvedValue([]);

    const result = await checkPasswordHistory(repo, 'user-1', 'NewPass1!');

    expect(result).toBe(false);
    expect(repo.findRecentByUserId).toHaveBeenCalledWith('user-1', 5);
  });

  it('should return true when password matches a recent hash', async () => {
    const hash = bcrypt.hashSync('ReusedPass1!', 4);
    vi.mocked(repo.findRecentByUserId).mockResolvedValue([
      { passwordHash: hash },
    ]);

    const result = await checkPasswordHistory(repo, 'user-1', 'ReusedPass1!');

    expect(result).toBe(true);
  });

  it('should return false when password does not match any recent hash', async () => {
    const hash1 = bcrypt.hashSync('OldPass1!', 4);
    const hash2 = bcrypt.hashSync('OldPass2!', 4);
    vi.mocked(repo.findRecentByUserId).mockResolvedValue([
      { passwordHash: hash1 },
      { passwordHash: hash2 },
    ]);

    const result = await checkPasswordHistory(repo, 'user-1', 'BrandNew3!');

    expect(result).toBe(false);
  });

  it('should check up to 5 hashes by default', async () => {
    const hashes = Array.from({ length: 5 }, (_, i) =>
      ({ passwordHash: bcrypt.hashSync(`Pass${i}!Aa`, 4) }),
    );
    vi.mocked(repo.findRecentByUserId).mockResolvedValue(hashes);

    // The 5th password should be found
    const result = await checkPasswordHistory(repo, 'user-1', 'Pass4!Aa');
    expect(result).toBe(true);
  });

  it('should respect custom limit parameter', async () => {
    vi.mocked(repo.findRecentByUserId).mockResolvedValue([]);

    await checkPasswordHistory(repo, 'user-1', 'SomePass1!', 3);

    expect(repo.findRecentByUserId).toHaveBeenCalledWith('user-1', 3);
  });
});
