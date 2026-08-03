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

  it('does not expose a completed response owned by another scope', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.createMany.mockResolvedValue({ count: 0 });
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      id: 'idem-1',
      key: 'shared-key',
      scope: 'another-command',
      response: { secret: 'another-command-result' },
      payload_hash: 'another-hash',
      expires_at: new Date(Date.now() + 60_000),
    });
    const service = new PrismaIdempotencyService(prisma as never);

    await expect(service.tryAcquire('shared-key', 'command', 'hash-1', 1)).resolves.toEqual({
      status: 'in_progress',
      payloadHash: 'another-hash',
    });
  });

  it('removes an expired key from another scope before reacquiring it', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.createMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.idempotencyKey.findUnique.mockResolvedValueOnce({
      id: 'idem-expired-other-scope',
      key: 'shared-key',
      scope: 'another-command',
      response: { secret: 'expired-result' },
      payload_hash: 'another-hash',
      expires_at: new Date(0),
    });
    prisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 1 });
    const service = new PrismaIdempotencyService(prisma as never);

    await expect(service.tryAcquire('shared-key', 'command', 'hash-1', 1)).resolves.toEqual({
      status: 'acquired',
      ownerToken: expect.any(String),
    });
  });

  it('bounds acquisition retries when a competing row repeatedly disappears', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.createMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockRejectedValueOnce(new Error('unbounded retry'));
    prisma.idempotencyKey.findUnique.mockResolvedValue(null);
    const service = new PrismaIdempotencyService(prisma as never);

    await expect(service.tryAcquire('command:key', 'command', 'hash-1', 1)).resolves.toEqual({
      status: 'in_progress',
      payloadHash: 'hash-1',
    });
    expect(prisma.idempotencyKey.createMany).toHaveBeenCalledTimes(3);
    expect(prisma.idempotencyKey.findUnique).toHaveBeenCalledTimes(3);
  });

  it('deletes an expired reservation and acquires its key on retry', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.createMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.idempotencyKey.findUnique.mockResolvedValueOnce({
      id: 'idem-expired',
      key: 'command:key',
      scope: 'command',
      response: { __idempotencyState: 'IN_PROGRESS', ownerToken: 'old-owner' },
      payload_hash: 'hash-1',
      expires_at: new Date(0),
    });
    prisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 1 });
    const service = new PrismaIdempotencyService(prisma as never);

    await expect(service.tryAcquire('command:key', 'command', 'hash-1', 1)).resolves.toEqual({
      status: 'acquired',
      ownerToken: expect.any(String),
    });
    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { id: 'idem-expired', expires_at: { lt: expect.any(Date) } },
    });
  });

  it('returns a completed response for the requested scope', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.createMany.mockResolvedValue({ count: 0 });
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      id: 'idem-1',
      key: 'command:key',
      scope: 'command',
      response: { ok: true },
      payload_hash: 'hash-1',
      expires_at: new Date(Date.now() + 60_000),
    });
    const service = new PrismaIdempotencyService(prisma as never);

    await expect(service.tryAcquire('command:key', 'command', 'hash-1', 1)).resolves.toEqual({
      status: 'completed',
      response: { ok: true },
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
      where: {
        key: 'command:principal:key',
        scope: 'command',
        payload_hash: 'hash-1',
        response: { path: ['ownerToken'], equals: 'owner-1' },
      },
    }));
    expect(prisma.idempotencyKey.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: {
        key: 'command:principal:key',
        scope: 'command',
        payload_hash: 'hash-1',
        response: { path: ['ownerToken'], equals: 'owner-1' },
      },
    }));
    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: {
        key: 'command:principal:key',
        scope: 'command',
        payload_hash: 'hash-1',
        response: { path: ['ownerToken'], equals: 'owner-1' },
      },
    });
  });

  it('reports a lost fencing token when renew or complete updates no row', async () => {
    const prisma = makePrisma();
    prisma.idempotencyKey.updateMany.mockResolvedValue({ count: 0 });
    const service = new PrismaIdempotencyService(prisma as never);

    await expect(service.renew('command:key', 'command', 'hash-1', 'owner-1', 1))
      .resolves.toBe(false);
    await expect(service.complete('command:key', 'command', 'owner-1', { ok: true }, 24, 'hash-1'))
      .resolves.toBe(false);
  });

});
