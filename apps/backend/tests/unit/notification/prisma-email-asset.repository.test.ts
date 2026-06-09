import { describe, it, expect, vi } from 'vitest';
import { PrismaEmailAssetRepository } from '../../../src/modules/notification/infrastructure/prisma-email-asset.repository';
import type { PrismaClient } from '@prisma/client';

function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    emailAsset: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      ...overrides,
    },
  } as unknown as PrismaClient;
}

describe('PrismaEmailAssetRepository.findByPlaceholderKey', () => {
  it('should use findFirst (not findUnique) so null tenantId is handled correctly', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const findUnique = vi.fn();
    const prisma = makePrisma({ findFirst, findUnique });
    const repo = new PrismaEmailAssetRepository(prisma as any);

    await repo.findByPlaceholderKey(null, 'header-logo');

    expect(findFirst).toHaveBeenCalledWith({
      where: { tenant_id: null, placeholder_key: 'header-logo' },
    });
    // findUnique must NOT be called — it cannot handle null in composite unique lookups
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('should also use findFirst for non-null tenantId (consistent behavior)', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const findUnique = vi.fn();
    const prisma = makePrisma({ findFirst, findUnique });
    const repo = new PrismaEmailAssetRepository(prisma as any);

    await repo.findByPlaceholderKey('tenant-abc', 'footer-logo');

    expect(findFirst).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-abc', placeholder_key: 'footer-logo' },
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('should return null when asset is not found', async () => {
    const prisma = makePrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    const repo = new PrismaEmailAssetRepository(prisma as any);

    const result = await repo.findByPlaceholderKey(null, 'non-existent');

    expect(result).toBeNull();
  });
});
