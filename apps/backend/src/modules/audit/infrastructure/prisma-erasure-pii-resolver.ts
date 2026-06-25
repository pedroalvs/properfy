import type { IUserManagementRepository } from '../../user/domain/user-management.repository';
import type {
  IErasurePiiResolver,
  ErasurePiiResolverInput,
  ErasurePiiResolverOutput,
} from '../domain/erasure-pii-resolver.ts';
import type { IAuditLogRepository } from '../domain/audit-log.repository';

/**
 * Feature 020 FR-019 / FR-019a / FR-019b: historical PII resolver.
 *
 * Input strategy:
 *   - user_id → fetch the current user, then walk lifecycle audit history
 *   - email   → findByEmail to resolve canonical user, then same strategy
 *   - phone   → findByPhone to resolve canonical user, then same strategy
 *
 * The walk scans `user.updated` and `inspector.updated` audit entries for the
 * target user to collect every historical name / email / phone value the
 * subject has ever carried. The resulting set is deduplicated and passed to
 * `searchPiiByValues` on the audit log repository.
 *
 * If the input cannot be resolved to a canonical user (unknown email/phone),
 * the resolver returns `{ canonicalUserId: null, piiValues: [input.value] }`
 * — the raw input value is used as a single-element scan target so operators
 * can still erase orphan snapshots that were never associated with a user row.
 */
export class PrismaErasurePiiResolver implements IErasurePiiResolver {
  constructor(
    private readonly userRepo: IUserManagementRepository,
    private readonly auditLogRepo: IAuditLogRepository,
  ) {}

  async resolve(input: ErasurePiiResolverInput): Promise<ErasurePiiResolverOutput> {
    const canonicalUser = await this.resolveCanonicalUser(input);

    const piiValues = new Set<string>();

    // Always include the raw input value as a search term (covers orphan snapshots).
    piiValues.add(input.value);

    if (canonicalUser) {
      if (canonicalUser.email) piiValues.add(canonicalUser.email);
      if (canonicalUser.name) piiValues.add(canonicalUser.name);
      // `phone` is not a required property on the current UserEntity but may be
      // present on subclasses / extended projections. Guard the access defensively.
      const phone = (canonicalUser as unknown as { phone?: string | null }).phone;
      if (phone) piiValues.add(phone);

      // Walk `user.updated` lifecycle history for this user id to collect
      // historical email / phone / name values.
      const historical = await this.walkLifecycleHistory(canonicalUser.id);
      for (const v of historical) piiValues.add(v);
    }

    return {
      canonicalUserId: canonicalUser?.id ?? null,
      piiValues: Array.from(piiValues).filter((v) => v.length > 0),
    };
  }

  private async resolveCanonicalUser(
    input: ErasurePiiResolverInput,
  ): Promise<{ id: string; email: string; name: string } | null> {
    if (input.type === 'user_id') {
      const user = await this.userRepo.findById(input.value);
      return user ? { id: user.id, email: user.email, name: user.name } : null;
    }
    if (input.type === 'email') {
      const user = await this.userRepo.findByEmail(input.value);
      return user ? { id: user.id, email: user.email, name: user.name } : null;
    }
    if (input.type === 'phone') {
      const user = await this.userRepo.findByPhone(input.value);
      return user ? { id: user.id, email: user.email, name: user.name } : null;
    }
    return null;
  }

  /**
   * Walks `user.updated` / `inspector.updated` audit entries for the given
   * user id and extracts historical name / email / phone values from their
   * `before_json` / `after_json` snapshots.
   */
  private async walkLifecycleHistory(userId: string): Promise<Set<string>> {
    const historical = new Set<string>();

    // Fetch up to 200 lifecycle entries for this user (enough for even a
    // decade of history on a single account).
    const userEntries = await this.auditLogRepo.findAll(
      { entityType: 'User', entityId: userId },
      { page: 1, pageSize: 200, sortOrder: 'desc' },
      { includeArchived: true },
    );
    const inspectorEntries = await this.auditLogRepo.findAll(
      { entityType: 'Inspector', entityId: userId },
      { page: 1, pageSize: 200, sortOrder: 'desc' },
      { includeArchived: true },
    );

    for (const entry of [...userEntries, ...inspectorEntries]) {
      for (const snapshot of [entry.beforeJson, entry.afterJson]) {
        if (snapshot && typeof snapshot === 'object') {
          const obj = snapshot as Record<string, unknown>;
          for (const field of ['name', 'email', 'phone']) {
            const v = obj[field];
            if (typeof v === 'string' && v.length > 0) {
              historical.add(v);
            }
          }
        }
      }
    }

    return historical;
  }
}
