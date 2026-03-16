import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import type { IAuditLogRepository } from '../../../src/modules/audit/domain/audit-log.repository';
import type { Logger } from '../../../src/shared/infrastructure/logger';

describe('PersistentAuditService', () => {
  let repo: {
    save: ReturnType<typeof vi.fn>;
    saveMany: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  let logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let service: PersistentAuditService;

  beforeEach(() => {
    repo = {
      save: vi.fn().mockResolvedValue(undefined),
      saveMany: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
    };
    logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    service = new PersistentAuditService(
      repo as unknown as IAuditLogRepository,
      logger as unknown as Logger,
    );
  });

  it('should log to structured logger', () => {
    service.log({
      action: 'test.action',
      actorType: 'USER',
      actorId: 'user-1',
      entityType: 'Test',
      entityId: 'test-1',
      tenantId: 'tenant-1',
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ audit: true, action: 'test.action' }),
      'AUDIT: test.action',
    );
  });

  it('should save to repository', () => {
    service.log({
      action: 'test.action',
      actorType: 'USER',
      actorId: 'user-1',
      entityType: 'Test',
      entityId: 'test-1',
    });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'test.action',
        actorType: 'USER',
        entityType: 'Test',
      }),
    );
  });

  it('should not throw if save fails (fire-and-forget)', async () => {
    repo.save.mockRejectedValue(new Error('DB error'));
    // Should not throw
    service.log({
      action: 'test.action',
      actorType: 'SYSTEM',
      entityType: 'Test',
    });
    // Wait for the promise to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(logger.error).toHaveBeenCalled();
  });
});
