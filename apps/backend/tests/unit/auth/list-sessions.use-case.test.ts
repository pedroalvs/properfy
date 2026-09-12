import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { ListSessionsUseCase } from '../../../src/modules/auth/application/use-cases/list-sessions.use-case';
import type { ISessionRepository } from '../../../src/modules/auth/domain/session.repository';
import { SessionEntity } from '../../../src/modules/auth/domain/session.entity';

function makeSession(overrides: Partial<ConstructorParameters<typeof SessionEntity>[0]> = {}): SessionEntity {
  return new SessionEntity({
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: 'hash',
    ipAddress: '1.2.3.4',
    userAgent: 'Mozilla/5.0',
    countryCode: null,
    deviceFingerprint: null,
    authStage: null,
    lastUsedAt: null,
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    role: 'CL_ADMIN',
    branchId: null,
    inspectorId: null,
    sessionId: 'session-1',
    ...overrides,
  };
}

describe('ListSessionsUseCase', () => {
  let sessionRepo: ISessionRepository;
  let useCase: ListSessionsUseCase;

  beforeEach(() => {
    sessionRepo = {
      create: vi.fn(),
      findByRefreshTokenHash: vi.fn(),
      findById: vi.fn(),
      findActiveByUserId: vi.fn(),
      rotateRefreshToken: vi.fn(),
      revoke: vi.fn(),
      revokeAllForUser: vi.fn(),
      findRecentByUserId: vi.fn(),
      deleteExpiredBefore: vi.fn(),
    } as unknown as ISessionRepository;
    useCase = new ListSessionsUseCase(sessionRepo);
  });

  it('flags only the session whose id matches actor.sessionId as current', async () => {
    const currentSession = makeSession({ id: 'session-1' });
    const otherSession = makeSession({ id: 'session-2' });
    vi.mocked(sessionRepo.findActiveByUserId).mockResolvedValue([currentSession, otherSession]);

    const result = await useCase.execute({ actor: makeActor({ sessionId: 'session-1' }) });

    expect(result).toHaveLength(2);
    const current = result.find((s) => s.id === 'session-1');
    const other = result.find((s) => s.id === 'session-2');
    expect(current?.isCurrent).toBe(true);
    expect(other?.isCurrent).toBe(false);
  });

  it('uses lastUsedAt for lastActiveAt when the session has been refreshed', async () => {
    const lastUsed = new Date('2026-03-15T10:00:00.000Z');
    const session = makeSession({
      id: 'session-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      lastUsedAt: lastUsed,
    });
    vi.mocked(sessionRepo.findActiveByUserId).mockResolvedValue([session]);

    const result = await useCase.execute({ actor: makeActor() });

    expect(result[0].lastActiveAt).toBe(lastUsed.toISOString());
  });

  it('falls back to createdAt for lastActiveAt when lastUsedAt is null', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const session = makeSession({ id: 'session-1', createdAt, lastUsedAt: null });
    vi.mocked(sessionRepo.findActiveByUserId).mockResolvedValue([session]);

    const result = await useCase.execute({ actor: makeActor() });

    expect(result[0].lastActiveAt).toBe(createdAt.toISOString());
  });
});
