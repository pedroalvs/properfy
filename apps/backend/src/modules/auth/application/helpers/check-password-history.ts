import bcrypt from 'bcryptjs';
import type { IPasswordHistoryRepository } from '../../domain/password-history.repository';

const DEFAULT_HISTORY_LIMIT = 5;

/**
 * Checks whether a new password matches any of the user's recent password hashes.
 * Returns `true` if the password was recently used and should be rejected.
 */
export async function checkPasswordHistory(
  repo: IPasswordHistoryRepository,
  userId: string,
  newPassword: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<boolean> {
  const recentHashes = await repo.findRecentByUserId(userId, limit);

  for (const entry of recentHashes) {
    const matches = await bcrypt.compare(newPassword, entry.passwordHash);
    if (matches) return true;
  }

  return false;
}
