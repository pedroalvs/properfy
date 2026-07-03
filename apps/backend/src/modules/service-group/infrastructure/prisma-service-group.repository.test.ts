import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaServiceGroupRepository } from './prisma-service-group.repository';

describe('PrismaServiceGroupRepository marketplace filters', () => {
  it('uses PostGIS spatial query to find eligible group IDs for marketplace offers', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'sg-1' }, { id: 'sg-2' }]);
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'sg-1',
        group_size: 3,
        scheduled_date: new Date('2026-05-01'),
        time_window: '08:00-12:00',
        priority_mode: 'STANDARD',
        priority_expires_at: null,
        service_type: { name: 'Routine' },
        appointments: [
          {
            key_required: false,
            payout_amount: 50,
            tenant_id: 'tenant-1',
            tenant: { name: 'Agency A' },
            property: { suburb: 'Bondi', street: '10 Main St' },
          },
        ],
      },
    ]);
    const prisma = {
      $queryRaw: queryRaw,
      serviceGroup: { findMany },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    const result = await repo.findPublishedForInspector(
      'inspector-1',
      ['st-1'],
      ['tenant-1'],
      { page: 1, pageSize: 20, sortOrder: 'asc' },
    );

    // Should call raw SQL for eligible IDs
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const rawCall = queryRaw.mock.calls[0][0];
    // Verify the SQL template contains ST_Intersects and key join conditions
    const sqlText = rawCall.map((s: unknown) => String(s)).join('');
    expect(sqlText).toContain('ST_Intersects');
    expect(sqlText).not.toContain('sr.tenant_id'); // cross-tenant: region ownership is not a match filter
    expect(sqlText).toContain('inspector_regions');

    // Should then use Prisma findMany to load full data for matched IDs
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['sg-1', 'sg-2'] } },
      }),
    );

    // Should map result correctly
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      groupId: 'sg-1',
      tenantName: 'Agency A',
      serviceTypeName: 'Routine',
      suburbs: ['Bondi'],
      payoutEstimate: 50,
    });
  });

  it('returns empty when spatial query finds no eligible groups', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const findMany = vi.fn();
    const prisma = {
      $queryRaw: queryRaw,
      serviceGroup: { findMany },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    const result = await repo.findPublishedForInspector(
      'inspector-1',
      ['st-1'],
      ['tenant-1'],
      { page: 1, pageSize: 20, sortOrder: 'asc' },
    );

    expect(result).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('counts eligible groups using PostGIS spatial join', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ count: BigInt(5) }]);
    const prisma = {
      $queryRaw: queryRaw,
      serviceGroup: { findMany: vi.fn(), count: vi.fn() },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    const result = await repo.countPublishedForInspector(
      'inspector-1',
      ['st-1'],
      ['tenant-1'],
    );

    expect(result).toBe(5);
    const rawCall = queryRaw.mock.calls[0][0];
    const sqlText = rawCall.map((s: unknown) => String(s)).join('');
    expect(sqlText).toContain('COUNT(DISTINCT sg.id)');
    expect(sqlText).toContain('ST_Intersects');
    expect(sqlText).not.toContain('sr.tenant_id'); // cross-tenant: region ownership is not a match filter
  });

  it('returns 0 count when inspector has no eligible service types', async () => {
    const queryRaw = vi.fn();
    const prisma = {
      $queryRaw: queryRaw,
      serviceGroup: { findMany: vi.fn(), count: vi.fn() },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    const result = await repo.countPublishedForInspector(
      'inspector-1',
      [],
      ['tenant-1'],
    );

    expect(result).toBe(0);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('returns early when the inspector has no eligible service types', async () => {
    const prisma = {
      $queryRaw: vi.fn(),
      serviceGroup: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    await expect(
      repo.findPublishedForInspector('inspector-1', [], ['tenant-1'], {
        page: 1,
        pageSize: 20,
        sortOrder: 'asc',
      }),
    ).resolves.toEqual([]);
    await expect(
      repo.countPublishedForInspector('inspector-1', [], ['tenant-1']),
    ).resolves.toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.serviceGroup.findMany).not.toHaveBeenCalled();
    expect(prisma.serviceGroup.count).not.toHaveBeenCalled();
  });

  it('runs the SQL query when the inspector has an empty blocked-clients list (denylist semantics: empty = eligible for all)', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = {
      $queryRaw: queryRaw,
      serviceGroup: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn() },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    // Empty blocked list → still query the DB; do NOT early-return.
    // (Allowlist semantics would have early-returned here — the regression
    // protected by this test prevents accidentally re-introducing that.)
    await expect(
      repo.findPublishedForInspector('inspector-1', ['st-1'], [], {
        page: 1,
        pageSize: 20,
        sortOrder: 'asc',
      }),
    ).resolves.toEqual([]);
    expect(queryRaw).toHaveBeenCalled();

    queryRaw.mockClear();
    queryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]);
    await expect(
      repo.countPublishedForInspector('inspector-1', ['st-1'], []),
    ).resolves.toBe(0);
    expect(queryRaw).toHaveBeenCalled();
  });

  it('SQL filter excludes blocked tenants via NOT ANY clause', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ count: BigInt(0) }]);
    const prisma = {
      $queryRaw: queryRaw,
      serviceGroup: { findMany: vi.fn() },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    await repo.countPublishedForInspector('inspector-1', ['st-1'], ['blocked-tenant-1', 'blocked-tenant-2']);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    // Tagged template strings array is the first arg; assert the SQL contains the denylist clause.
    const sqlParts = queryRaw.mock.calls[0][0] as string[];
    const sqlText = sqlParts.join('');
    // Groups are tenant-agnostic: the denylist is appointment-based (exclude the
    // group if it contains an appointment of any blocked agency).
    expect(sqlText).toMatch(/NOT EXISTS\s*\(\s*SELECT 1 FROM appointments ga/);
    expect(sqlText).toMatch(/ga\.tenant_id = ANY/);
    // The blocked array must be among the interpolated params.
    const params = queryRaw.mock.calls[0].slice(1);
    expect(params).toContainEqual(['blocked-tenant-1', 'blocked-tenant-2']);
  });

  it('passes correct pagination offset to spatial query', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = {
      $queryRaw: queryRaw,
      serviceGroup: { findMany: vi.fn() },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    await repo.findPublishedForInspector(
      'inspector-1',
      ['st-1'],
      ['tenant-1'],
      { page: 3, pageSize: 10, sortOrder: 'asc' },
    );

    // Page 3, pageSize 10 => offset 20, limit 10
    // The raw query should have been called with the inspectorId, service types, client eligibility, limit, offset
    expect(queryRaw).toHaveBeenCalledTimes(1);
    // The tagged template params are accessible via the second arg onwards
    const params = queryRaw.mock.calls[0].slice(1);
    // params should include: inspectorId, serviceTypes, clientEligibility, limit (10), offset (20)
    expect(params).toContain('inspector-1');
    expect(params).toContain(10);
    expect(params).toContain(20);
  });

  it('region matching is cross-tenant (no sr.tenant_id predicate); isolation via the denylist', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ count: BigInt(0) }]);
    const prisma = {
      $queryRaw: queryRaw,
      serviceGroup: { findMany: vi.fn(), count: vi.fn() },
    };

    const repo = new PrismaServiceGroupRepository(prisma as any);

    await repo.countPublishedForInspector('inspector-1', ['st-1'], ['tenant-1']);

    const rawCall = queryRaw.mock.calls[0][0];
    const sqlText = rawCall.map((s: unknown) => String(s)).join('');
    // Cross-tenant: region ownership (sr.tenant_id) is NOT a matching filter at all.
    expect(sqlText).not.toContain('sr.tenant_id');
    // Isolation is preserved by the per-appointment inspector->client denylist.
    expect(sqlText).toContain('ga.tenant_id = ANY');
  });
});

describe('PrismaServiceGroupRepository list filters', () => {
  const findMany = vi.fn();
  const countFn = vi.fn();

  const prisma = {
    serviceGroup: {
      findMany,
      count: countFn,
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    countFn.mockResolvedValue(0);
  });

  it('filters by search on description', async () => {
    const repo = new PrismaServiceGroupRepository(prisma);

    await repo.findAll(
      { search: 'bondi' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { description: { contains: 'bondi', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });

  it('filters by branchId via linked appointments', async () => {
    const repo = new PrismaServiceGroupRepository(prisma);

    await repo.findAll(
      { branchId: 'branch-abc' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          appointments: {
            some: { branch_id: 'branch-abc', deleted_at: null },
          },
        }),
      }),
    );
  });

  it('filters by contactSearch on linked appointment contacts', async () => {
    const repo = new PrismaServiceGroupRepository(prisma);

    await repo.findAll(
      { contactSearch: 'smith' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          appointments: {
            some: {
              contacts: {
                some: {
                  OR: [
                    { snapshot_name: { contains: 'smith', mode: 'insensitive' } },
                    { snapshot_email: { contains: 'smith', mode: 'insensitive' } },
                    { snapshot_phone: { contains: 'smith' } },
                    { rental_tenant_name: { contains: 'smith', mode: 'insensitive' } },
                    { primary_email: { contains: 'smith', mode: 'insensitive' } },
                    { primary_phone: { contains: 'smith' } },
                  ],
                },
              },
              deleted_at: null,
            },
          },
        }),
      }),
    );
  });

  it('combines branchId and contactSearch using AND', async () => {
    const repo = new PrismaServiceGroupRepository(prisma);

    await repo.findAll(
      { branchId: 'branch-abc', contactSearch: 'john' },
      { page: 1, pageSize: 10, sortOrder: 'asc' },
    );

    const call = findMany.mock.calls[0][0];
    // Multiple appointment predicates (branch + contact) are each their own
    // `appointments.some` clause combined under AND — neither overwrites the other.
    expect(call.where.appointments).toBeUndefined();
    expect(call.where.AND).toEqual(
      expect.arrayContaining([
        {
          appointments: {
            some: { branch_id: 'branch-abc', deleted_at: null },
          },
        },
        {
          appointments: {
            some: {
              contacts: {
                some: {
                  OR: expect.arrayContaining([
                    { snapshot_name: { contains: 'john', mode: 'insensitive' } },
                  ]),
                },
              },
              deleted_at: null,
            },
          },
        },
      ]),
    );
  });

  it('count uses same search filter as findAll', async () => {
    const repo = new PrismaServiceGroupRepository(prisma);

    await repo.count({ search: 'test group' });

    expect(countFn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { description: { contains: 'test group', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });
});

describe('PrismaServiceGroupRepository.findPortalEligibleSlots', () => {
  const TODAY = new Date('2026-05-24');

  function makeRepo(queryRawReturn: unknown[]) {
    const queryRaw = vi.fn().mockResolvedValue(queryRawReturn);
    const prisma = { $queryRaw: queryRaw };
    return { repo: new PrismaServiceGroupRepository(prisma as any), queryRaw };
  }

  it('returns mapped groups when rows found', async () => {
    const { repo } = makeRepo([
      {
        group_id: 'sg-1',
        scheduled_date: new Date('2026-05-30'),
        time_slot_start: '13:00',
        time_slot_end: '15:00',
        suburb: 'Surry Hills',
        inspector_name: 'John Smith',
        confirmed_count: BigInt(3),
      },
    ]);

    const result = await repo.findPortalEligibleSlots({
      tenantId: 'tenant-1',
      serviceTypeId: 'stype-1',
      propertyId: 'prop-1',
      today: TODAY,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      groupId: 'sg-1',
      timeSlotStart: '13:00',
      timeSlotEnd: '15:00',
      suburb: 'Surry Hills',
      inspectorName: 'John Smith',
      confirmedCount: 3,
      capacityMax: 10,
    });
    expect(result[0]!.scheduledDate).toEqual(new Date('2026-05-30'));
  });

  it('returns empty array when no rows found', async () => {
    const { repo } = makeRepo([]);
    const result = await repo.findPortalEligibleSlots({
      tenantId: 'tenant-1',
      serviceTypeId: 'stype-1',
      propertyId: 'prop-1',
      today: TODAY,
    });
    expect(result).toEqual([]);
  });

  it('uses ST_DWithin for proximity filter', async () => {
    const { repo, queryRaw } = makeRepo([]);
    await repo.findPortalEligibleSlots({
      tenantId: 'tenant-1',
      serviceTypeId: 'stype-1',
      propertyId: 'prop-1',
      today: TODAY,
    });

    const rawCall = queryRaw.mock.calls[0][0];
    const sqlText = rawCall.map((s: unknown) => String(s)).join('');
    expect(sqlText).toContain('ST_DWithin');
    expect(sqlText).toContain('eligible_groups');
    expect(sqlText).toContain('time_slot_start');
    expect(sqlText).toContain('ACCEPTED');
    expect(sqlText).toContain('2000');
  });
});
