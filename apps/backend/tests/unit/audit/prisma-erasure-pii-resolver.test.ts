import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaErasurePiiResolver } from '../../../src/modules/audit/infrastructure/prisma-erasure-pii-resolver';
import type { IUserManagementRepository } from '../../../src/modules/user/domain/user-management.repository';
import type { IAuditLogRepository } from '../../../src/modules/audit/domain/audit-log.repository';
import { AuditLogEntity } from '../../../src/modules/audit/domain/audit-log.entity';

function makeAuditEntry(overrides: {
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  action: string;
}): AuditLogEntity {
  return new AuditLogEntity({
    id: `entry-${Math.random()}`,
    tenantId: null,
    actorType: 'USER',
    actorId: 'actor-1',
    entityType: overrides.entityType,
    entityId: overrides.entityId,
    action: overrides.action,
    reason: null,
    beforeJson: overrides.before ?? null,
    afterJson: overrides.after ?? null,
    requestId: null,
    ipAddress: null,
    metadataJson: null,
    createdAt: new Date(),
    retentionCategory: 'OPERATIONAL_CRITICAL',
    redactionStatus: 'NONE',
    coldStorage: false,
    preservationRuleId: null,
  });
}

function makeUserRepo(): IUserManagementRepository {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByPhone: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  } as unknown as IUserManagementRepository;
}

function makeAuditLogRepo(): IAuditLogRepository {
  return {
    save: vi.fn(),
    saveMany: vi.fn(),
    findAll: vi.fn().mockResolvedValue([]),
    count: vi.fn(),
    findById: vi.fn(),
    findByIds: vi.fn(),
    updateRedactionStatus: vi.fn(),
    updateRedactedSnapshots: vi.fn(),
    moveToCold: vi.fn(),
    hardDeleteFromArchive: vi.fn(),
    findEligibleForRetention: vi.fn(),
    searchPiiByValues: vi.fn(),
  };
}

describe('PrismaErasurePiiResolver (Feature 020 FR-019 / FR-019a / FR-019b)', () => {
  let userRepo: IUserManagementRepository;
  let auditLogRepo: IAuditLogRepository;
  let resolver: PrismaErasurePiiResolver;

  beforeEach(() => {
    userRepo = makeUserRepo();
    auditLogRepo = makeAuditLogRepo();
    resolver = new PrismaErasurePiiResolver(userRepo, auditLogRepo);
  });

  it('user_id path: returns current + historical PII values from user.updated entries', async () => {
    (userRepo.findById as any).mockResolvedValueOnce({
      id: 'u1',
      email: 'current@example.com',
      name: 'Current Name',
    });
    // Mock lifecycle history entries
    (auditLogRepo.findAll as any)
      .mockResolvedValueOnce([
        makeAuditEntry({
          entityType: 'User',
          entityId: 'u1',
          action: 'user.updated',
          before: { email: 'old1@example.com', name: 'Old Name' },
          after: { email: 'old2@example.com', name: 'Another Name' },
        }),
      ])
      .mockResolvedValueOnce([]); // inspector entries

    const result = await resolver.resolve({ type: 'user_id', value: 'u1' });

    expect(result.canonicalUserId).toBe('u1');
    expect(result.piiValues).toContain('u1'); // raw input value
    expect(result.piiValues).toContain('current@example.com');
    expect(result.piiValues).toContain('Current Name');
    expect(result.piiValues).toContain('old1@example.com');
    expect(result.piiValues).toContain('Old Name');
    expect(result.piiValues).toContain('old2@example.com');
    expect(result.piiValues).toContain('Another Name');
  });

  it('email path: resolves canonical user via findByEmail, then walks history', async () => {
    (userRepo.findByEmail as any).mockResolvedValueOnce({
      id: 'u2',
      email: 'foo@bar.com',
      name: 'User Two',
    });
    (auditLogRepo.findAll as any).mockResolvedValue([]);

    const result = await resolver.resolve({ type: 'email', value: 'foo@bar.com' });

    expect(userRepo.findByEmail).toHaveBeenCalledWith('foo@bar.com');
    expect(result.canonicalUserId).toBe('u2');
    expect(result.piiValues).toContain('foo@bar.com');
    expect(result.piiValues).toContain('User Two');
  });

  it('phone path: resolves canonical user via findByPhone, then walks history', async () => {
    (userRepo.findByPhone as any).mockResolvedValueOnce({
      id: 'u3',
      email: 'phone@example.com',
      name: 'Phone User',
    });
    (auditLogRepo.findAll as any).mockResolvedValue([]);

    const result = await resolver.resolve({ type: 'phone', value: '+5511999998888' });

    expect(userRepo.findByPhone).toHaveBeenCalledWith('+5511999998888');
    expect(result.canonicalUserId).toBe('u3');
    expect(result.piiValues).toContain('+5511999998888');
    expect(result.piiValues).toContain('phone@example.com');
    expect(result.piiValues).toContain('Phone User');
  });

  it('missing user_id: returns null canonicalUserId + raw input only', async () => {
    (userRepo.findById as any).mockResolvedValueOnce(null);

    const result = await resolver.resolve({ type: 'user_id', value: 'ghost' });

    expect(result.canonicalUserId).toBeNull();
    // Raw input still included so operators can erase orphan snapshots
    expect(result.piiValues).toContain('ghost');
  });

  it('missing email: returns null canonicalUserId + raw input only', async () => {
    (userRepo.findByEmail as any).mockResolvedValueOnce(null);

    const result = await resolver.resolve({ type: 'email', value: 'gone@example.com' });

    expect(result.canonicalUserId).toBeNull();
    expect(result.piiValues).toContain('gone@example.com');
  });
});
