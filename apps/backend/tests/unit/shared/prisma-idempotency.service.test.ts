import { describe, expect, it, vi } from 'vitest';
import { PrismaIdempotencyService } from '../../../src/modules/inspector-execution/infrastructure/prisma-idempotency.service';

function makePrisma() {
  return {
    idempotencyKey: {
      createMany: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe('PrismaIdempotencyService', () => {
  it('atomically reserves a caller-namespaced key', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.createMany.mockResolvedValue({ count: 1 });
    const service = new PrismaIdempotencyService(prisma as never);

    const result = await service.tryAcquire('command:principal:client-key', 'command', 'hash-1', 1);
    expect(result).toEqual({ status: 'acquired', ownerToken: expect.any(String) });
    expect(prisma.idempotencyKey.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        key: 'command:principal:client-key',
        scope: 'command',
        payload_hash: 'hash-1',
        response: { __idempotencyState: 'IN_PROGRESS', ownerToken: expect.any(String) },
      })],
      skipDuplicates: true,
    });
  });

  it('reports an existing reservation instead of acquiring it twice', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.createMany.mockResolvedValue({ count: 0 });
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      id: 'idem-1',
      key: 'command:principal:client-key',
      scope: 'command',
      response: { __idempotencyState: 'IN_PROGRESS', ownerToken: 'owner-old' },
      payload_hash: 'hash-1',
      expires_at: new Date(Date.now() + 60_000),
    });
    const service = new PrismaIdempotencyService(prisma as never);

    await expect(service.tryAcquire('command:principal:client-key', 'command', 'hash-1', 1)).resolves.toEqual({
      status: 'in_progress',
      payloadHash: 'hash-1',
    });
  });

  it('renews, completes and releases only the reservation owned by the supplied token', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.updateMany.mockResolvedValue({ count: 1 });
    prisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 1 });
    const service = new PrismaIdempotencyService(prisma as never);

    await expect(service.renew(
      'command:principal:key',
      'command',
      'hash-1',
      'owner-1',
      1,
    )).resolves.toBe(true);
    await expect(service.complete(
      'command:principal:key',
      'command',
      'owner-1',
      { ok: true },
      24,
      'hash-1',
    )).resolves.toBe(true);
    await service.release('command:principal:key', 'command', 'hash-1', 'owner-1');

    expect(prisma.idempotencyKey.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        response: { path: ['ownerToken'], equals: 'owner-1' },
      }),
    }));
    expect(prisma.idempotencyKey.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        response: { path: ['ownerToken'], equals: 'owner-1' },
      }),
    }));
    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        response: { path: ['ownerToken'], equals: 'owner-1' },
      }),
    });
  });

});
