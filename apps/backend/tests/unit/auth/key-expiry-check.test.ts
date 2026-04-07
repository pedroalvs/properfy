import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyExpiryCheckWorker } from '../../../src/modules/auth/infrastructure/workers/key-expiry-check.worker';
import type { JwtService } from '../../../src/modules/auth/application/services/jwt.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { Logger } from '../../../src/shared/infrastructure/logger';

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'info',
    silent: vi.fn(),
  } as unknown as Logger;
}

function createMockAuditService(): AuditService {
  return { log: vi.fn() };
}

function createMockJwtService(daysRemaining: number | null): JwtService {
  return {
    getPreviousKeyDaysRemaining: vi.fn().mockReturnValue(daysRemaining),
  } as unknown as JwtService;
}

describe('KeyExpiryCheckWorker', () => {
  let logger: Logger;
  let auditService: AuditService;

  beforeEach(() => {
    logger = createMockLogger();
    auditService = createMockAuditService();
  });

  it('should return ok with null when no previous key is configured', () => {
    const jwtService = createMockJwtService(null);
    const worker = new KeyExpiryCheckWorker(jwtService, auditService, logger);

    const result = worker.execute();

    expect(result).toEqual({ daysRemaining: null, level: 'ok' });
    expect(logger.info).toHaveBeenCalledWith('No previous JWT key configured, nothing to check');
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should return ok when previous key has 30 days remaining', () => {
    const jwtService = createMockJwtService(30);
    const worker = new KeyExpiryCheckWorker(jwtService, auditService, logger);

    const result = worker.execute();

    expect(result).toEqual({ daysRemaining: 30, level: 'ok' });
    expect(logger.info).toHaveBeenCalledWith(
      { daysRemaining: 30 },
      'JWT previous key grace period: %d day(s) remaining',
      30,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.key_expiry_check',
        actorType: 'SYSTEM',
        entityType: 'jwt_key',
        metadata: { daysRemaining: 30, level: 'ok' },
      }),
    );
  });

  it('should return warning when previous key has 7 days remaining', () => {
    const jwtService = createMockJwtService(7);
    const worker = new KeyExpiryCheckWorker(jwtService, auditService, logger);

    const result = worker.execute();

    expect(result).toEqual({ daysRemaining: 7, level: 'warning' });
    expect(logger.warn).toHaveBeenCalledWith(
      { daysRemaining: 7 },
      'WARNING: JWT previous key expires in %d day(s). Plan to clean up JWT_PREVIOUS_* variables soon.',
      7,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { daysRemaining: 7, level: 'warning' },
      }),
    );
  });

  it('should return warning when previous key has 5 days remaining', () => {
    const jwtService = createMockJwtService(5);
    const worker = new KeyExpiryCheckWorker(jwtService, auditService, logger);

    const result = worker.execute();

    expect(result).toEqual({ daysRemaining: 5, level: 'warning' });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should return critical when previous key has 1 day remaining', () => {
    const jwtService = createMockJwtService(1);
    const worker = new KeyExpiryCheckWorker(jwtService, auditService, logger);

    const result = worker.execute();

    expect(result).toEqual({ daysRemaining: 1, level: 'critical' });
    expect(logger.error).toHaveBeenCalledWith(
      { daysRemaining: 1 },
      'CRITICAL: JWT previous key expires in %d day(s) or has already expired. Remove JWT_PREVIOUS_* variables and redeploy.',
      1,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { daysRemaining: 1, level: 'critical' },
      }),
    );
  });

  it('should return critical when previous key has already expired (0 days)', () => {
    const jwtService = createMockJwtService(0);
    const worker = new KeyExpiryCheckWorker(jwtService, auditService, logger);

    const result = worker.execute();

    expect(result).toEqual({ daysRemaining: 0, level: 'critical' });
    expect(logger.error).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { daysRemaining: 0, level: 'critical' },
      }),
    );
  });

  it('should return ok when previous key has 8 days remaining (above warning threshold)', () => {
    const jwtService = createMockJwtService(8);
    const worker = new KeyExpiryCheckWorker(jwtService, auditService, logger);

    const result = worker.execute();

    expect(result).toEqual({ daysRemaining: 8, level: 'ok' });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
