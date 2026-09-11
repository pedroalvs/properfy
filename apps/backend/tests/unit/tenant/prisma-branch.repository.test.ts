import { describe, it, expect, vi } from 'vitest';
import { PrismaBranchRepository } from '../../../src/modules/tenant/infrastructure/prisma-branch.repository';

function makePrisma() {
  return {
    branch: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

describe('PrismaBranchRepository.findAll — sort-field allow-list', () => {
  const tenantId = 'tenant-1';
  const filters = {};

  it('honours a valid sort field', async () => {
    const prisma = makePrisma();
    const repo = new PrismaBranchRepository(prisma);

    await repo.findAll(tenantId, filters, {
      page: 1,
      pageSize: 20,
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } }),
    );
  });

  it('maps camelCase valid fields to their snake_case column (contactEmail → contact_email)', async () => {
    const prisma = makePrisma();
    const repo = new PrismaBranchRepository(prisma);

    await repo.findAll(tenantId, filters, {
      page: 1,
      pageSize: 20,
      sortBy: 'contactEmail',
      sortOrder: 'desc',
    });

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { contact_email: 'desc' } }),
    );
  });

  it('falls back to created_at for an unknown column', async () => {
    const prisma = makePrisma();
    const repo = new PrismaBranchRepository(prisma);

    await repo.findAll(tenantId, filters, {
      page: 1,
      pageSize: 20,
      sortBy: 'evil_column',
      sortOrder: 'asc',
    });

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { created_at: 'asc' } }),
    );
  });

  it('falls back to created_at for a camelCase injection of a non-sortable field (settingsJson)', async () => {
    const prisma = makePrisma();
    const repo = new PrismaBranchRepository(prisma);

    await repo.findAll(tenantId, filters, {
      page: 1,
      pageSize: 20,
      sortBy: 'settingsJson',
      sortOrder: 'desc',
    });

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { created_at: 'desc' } }),
    );
  });

  it('defaults to created_at when no sortBy is provided', async () => {
    const prisma = makePrisma();
    const repo = new PrismaBranchRepository(prisma);

    await repo.findAll(tenantId, filters, {
      page: 1,
      pageSize: 20,
      sortOrder: 'desc',
    });

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { created_at: 'desc' } }),
    );
  });
});
