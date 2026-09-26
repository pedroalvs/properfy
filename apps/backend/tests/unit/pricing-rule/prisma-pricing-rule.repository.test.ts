import { describe, it, expect, vi } from 'vitest';
import { PrismaPricingRuleRepository } from '../../../src/modules/pricing-rule/infrastructure/prisma-pricing-rule.repository';
import type { PricingRuleFilters, PaginationParams } from '../../../src/modules/pricing-rule/domain/pricing-rule.repository';

function makeRepo(findMany = vi.fn().mockResolvedValue([])) {
  const prisma = {
    servicePriceRule: { findMany, count: vi.fn().mockResolvedValue(0) },
  } as unknown as ConstructorParameters<typeof PrismaPricingRuleRepository>[0];
  return { repo: new PrismaPricingRuleRepository(prisma), findMany };
}

const filters: PricingRuleFilters = { tenantId: 't1' };

describe('PrismaPricingRuleRepository — sortBy allowlist (#608)', () => {
  it('falls back to created_at for an unknown sortBy, without throwing', async () => {
    const { repo, findMany } = makeRepo();

    const pagination: PaginationParams = { page: 1, pageSize: 10, sortBy: 'evil_column', sortOrder: 'asc' };
    await expect(repo.findAll(filters, pagination)).resolves.toEqual([]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { created_at: 'asc' } }),
    );
  });

  it('falls back to created_at for an empty-string sortBy (schema accepts it) — no invalid orderBy (#608)', async () => {
    const { repo, findMany } = makeRepo();

    const pagination: PaginationParams = { page: 1, pageSize: 10, sortBy: '', sortOrder: 'asc' };
    await expect(repo.findAll(filters, pagination)).resolves.toEqual([]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { created_at: 'asc' } }),
    );
  });

  it('maps an allowlisted camelCase sortBy to its snake_case column', async () => {
    const { repo, findMany } = makeRepo();

    const pagination: PaginationParams = { page: 1, pageSize: 10, sortBy: 'priceAmount', sortOrder: 'desc' };
    await repo.findAll(filters, pagination);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { price_amount: 'desc' } }),
    );
  });

  it('applies the same allowlist to the name-enriched list query', async () => {
    const { repo, findMany } = makeRepo();

    const pagination: PaginationParams = { page: 1, pageSize: 10, sortBy: 'nope', sortOrder: 'asc' };
    await repo.findAllWithNames(filters, pagination);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { created_at: 'asc' } }),
    );
  });
});
