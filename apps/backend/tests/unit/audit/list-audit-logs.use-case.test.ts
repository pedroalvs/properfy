import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListAuditLogsUseCase } from '../../../src/modules/audit/application/use-cases/list-audit-logs.use-case';
import type { IAuditLogRepository } from '../../../src/modules/audit/domain/audit-log.repository';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuditLogEntity } from '../../../src/modules/audit/domain/audit-log.entity';

function makeAuditLog(overrides: Partial<ConstructorParameters<typeof AuditLogEntity>[0]> = {}): AuditLogEntity {
  return new AuditLogEntity({
    id: 'audit-1',
    tenantId: 'tenant-1',
    actorType: 'USER',
    actorId: 'user-1',
    entityType: 'Appointment',
    entityId: 'appt-1',
    action: 'appointment.created',
    reason: null,
    beforeJson: null,
    afterJson: { status: 'DRAFT' },
    requestId: 'req-1',
    ipAddress: null,
    metadataJson: null,
    createdAt: new Date(),
    ...overrides,
  });
}

const amActor: AuthContext = {
  userId: 'user-am',
  tenantId: null,
  role: 'AM',
  branchId: null,
  inspectorId: null,
};

const opActor: AuthContext = {
  userId: 'user-op',
  tenantId: 'tenant-1',
  role: 'OP',
  branchId: null,
  inspectorId: null,
};

const clAdminActor: AuthContext = {
  userId: 'user-cl',
  tenantId: 'tenant-1',
  role: 'CL_ADMIN',
  branchId: 'branch-1',
  inspectorId: null,
};

describe('ListAuditLogsUseCase', () => {
  let repo: {
    save: ReturnType<typeof vi.fn>;
    saveMany: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  let useCase: ListAuditLogsUseCase;

  beforeEach(() => {
    repo = {
      save: vi.fn(),
      saveMany: vi.fn(),
      findAll: vi.fn().mockResolvedValue([makeAuditLog()]),
      count: vi.fn().mockResolvedValue(1),
    };
    useCase = new ListAuditLogsUseCase(repo as unknown as IAuditLogRepository);
  });

  it('should return audit logs for AM', async () => {
    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
      actor: amActor,
    });
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(repo.findAll).toHaveBeenCalled();
  });

  it('should return audit logs for OP scoped to tenant', async () => {
    await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
      actor: opActor,
    });
    expect(repo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('should reject INSP', async () => {
    await expect(
      useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: { userId: 'insp-1', tenantId: null, role: 'INSP', branchId: null, inspectorId: null },
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject CL_USER', async () => {
    await expect(
      useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: { userId: 'cl-user-1', tenantId: 'tenant-1', role: 'CL_USER', branchId: 'branch-1', inspectorId: null },
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should pass filters through to repository', async () => {
    await useCase.execute({
      filters: { entityType: 'ServiceGroup', action: 'service_group.created' },
      pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
      actor: amActor,
    });
    expect(repo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'ServiceGroup', action: 'service_group.created' }),
      expect.any(Object),
      expect.any(Object),
    );
  });

  // GAP-002: CL_ADMIN audit log read access
  describe('CL_ADMIN access', () => {
    it('should allow CL_ADMIN to view audit logs', async () => {
      const result = await useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: clAdminActor,
      });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should force tenantId to actor tenantId for CL_ADMIN', async () => {
      await useCase.execute({
        filters: { tenantId: 'other-tenant' } as any,
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: clAdminActor,
      });
      // CL_ADMIN always scoped to own tenant, ignoring provided tenantId
      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1' }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should mask beforeJson and afterJson for CL_ADMIN', async () => {
      repo.findAll.mockResolvedValue([
        makeAuditLog({
          beforeJson: { status: 'DRAFT' },
          afterJson: { status: 'SCHEDULED' },
        }),
      ]);

      const result = await useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: clAdminActor,
      });

      expect(result.data[0].beforeJson).toBe('[MASKED]');
      expect(result.data[0].afterJson).toBe('[MASKED]');
    });

    it('should not mask beforeJson and afterJson for AM', async () => {
      repo.findAll.mockResolvedValue([
        makeAuditLog({
          beforeJson: { status: 'DRAFT' },
          afterJson: { status: 'SCHEDULED' },
        }),
      ]);

      const result = await useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: amActor,
      });

      expect(result.data[0].beforeJson).toEqual({ status: 'DRAFT' });
      expect(result.data[0].afterJson).toEqual({ status: 'SCHEDULED' });
    });

    it('should not mask beforeJson and afterJson for OP', async () => {
      repo.findAll.mockResolvedValue([
        makeAuditLog({
          beforeJson: { status: 'DRAFT' },
          afterJson: { status: 'SCHEDULED' },
        }),
      ]);

      const result = await useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: opActor,
      });

      expect(result.data[0].beforeJson).toEqual({ status: 'DRAFT' });
      expect(result.data[0].afterJson).toEqual({ status: 'SCHEDULED' });
    });
  });

  // GAP-009: Full-text search
  describe('full-text search', () => {
    it('should pass q filter through to repository', async () => {
      await useCase.execute({
        filters: { q: 'cancelled by client' },
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: amActor,
      });
      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'cancelled by client' }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should return matching results for search query', async () => {
      const matchingLog = makeAuditLog({ reason: 'Cancelled by client request' });
      repo.findAll.mockResolvedValue([matchingLog]);
      repo.count.mockResolvedValue(1);

      const result = await useCase.execute({
        filters: { q: 'cancelled client' },
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: amActor,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should return empty results when nothing matches', async () => {
      repo.findAll.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      const result = await useCase.execute({
        filters: { q: 'nonexistent term xyz' },
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: amActor,
      });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ─── Feature 020 US4: role-based read masking + includeArchived ──────────

  describe('Feature 020 — role-based read masking (FR-025)', () => {
    const piiMappings = [
      {
        id: 'p1',
        actionPattern: 'user.',
        jsonFieldPath: 'email',
        classification: 'direct' as const,
        requiresManualReview: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        appliesTo(action: string) {
          return action.startsWith('user.');
        },
      },
      {
        id: 'p2',
        actionPattern: 'user.',
        jsonFieldPath: 'phone',
        classification: 'direct' as const,
        requiresManualReview: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        appliesTo(action: string) {
          return action.startsWith('user.');
        },
      },
      {
        id: 'p3',
        actionPattern: 'user.',
        jsonFieldPath: 'name',
        classification: 'direct' as const,
        requiresManualReview: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        appliesTo(action: string) {
          return action.startsWith('user.');
        },
      },
    ];
    const piiRepo = {
      findAll: vi.fn().mockResolvedValue(piiMappings),
      findByAction: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    beforeEach(() => {
      piiRepo.findAll.mockResolvedValue(piiMappings);
      useCase = new ListAuditLogsUseCase(
        repo as unknown as IAuditLogRepository,
        undefined,
        piiRepo as any,
      );
    });

    function makeUserEntry() {
      return makeAuditLog({
        action: 'user.updated',
        afterJson: { email: 'user@example.com', phone: '+5511999998888', name: 'John Doe', other: 'keep' },
      });
    }

    it('AM sees raw PII', async () => {
      repo.findAll.mockResolvedValue([makeUserEntry()]);
      const result = await useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: amActor,
      });
      expect((result.data[0]!.afterJson as any).email).toBe('user@example.com');
      expect((result.data[0]!.afterJson as any).phone).toBe('+5511999998888');
      expect((result.data[0]!.afterJson as any).name).toBe('John Doe');
    });

    it('OP sees partial masks', async () => {
      repo.findAll.mockResolvedValue([makeUserEntry()]);
      const result = await useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: opActor,
      });
      const after = result.data[0]!.afterJson as any;
      expect(after.email).toBe('use***@example.com');
      expect(after.phone).toBe('***8888');
      expect(after.name).toBe('J. D.');
      expect(after.other).toBe('keep');
    });

    it('CL_ADMIN sees blanket [MASKED]', async () => {
      repo.findAll.mockResolvedValue([makeUserEntry()]);
      const result = await useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: clAdminActor,
      });
      expect(result.data[0]!.beforeJson).toBe('[MASKED]');
      expect(result.data[0]!.afterJson).toBe('[MASKED]');
    });

    it('already-redacted (FULL) entries bypass masking — sentinel preserved', async () => {
      repo.findAll.mockResolvedValue([
        makeAuditLog({
          action: 'user.updated',
          afterJson: { email: '[REDACTED]', name: '[REDACTED]' },
          redactionStatus: 'FULL',
        }),
      ]);
      const result = await useCase.execute({
        filters: {},
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: amActor,
      });
      expect((result.data[0]!.afterJson as any).email).toBe('[REDACTED]');
      expect((result.data[0]!.afterJson as any).name).toBe('[REDACTED]');
    });
  });

  describe('Feature 020 — includeArchived opt-in (FR-026a)', () => {
    it('CL_ADMIN with includeArchived=true → 403', async () => {
      await expect(
        useCase.execute({
          filters: { includeArchived: true },
          pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
          actor: clAdminActor,
        }),
      ).rejects.toThrow(/INCLUDE_ARCHIVED_FORBIDDEN|archived/i);
    });

    it('AM with includeArchived=true passes option to repo', async () => {
      await useCase.execute({
        filters: { includeArchived: true },
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: amActor,
      });
      expect(repo.findAll).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({ includeArchived: true }),
      );
    });

    it('isArchived flag propagates to DTO when set on entity', async () => {
      repo.findAll.mockResolvedValue([
        makeAuditLog({ isArchived: true }),
      ]);
      const result = await useCase.execute({
        filters: { includeArchived: true },
        pagination: { page: 1, pageSize: 20, sortOrder: 'desc' },
        actor: amActor,
      });
      expect(result.data[0]!.isArchived).toBe(true);
    });
  });
});
