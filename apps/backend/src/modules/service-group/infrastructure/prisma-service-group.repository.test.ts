import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaServiceGroupRepository } from './prisma-service-group.repository';

describe('PrismaServiceGroupRepository marketplace filters', () => {
  it('uses PostGIS spatial query to find eligible group IDs for marketplace offers', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'sg-1' }, { id: 'sg-2' }]);
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'sg-1',
        scheduled_date: new Date('2026-05-01'),
        time_window: '08:00-12:00',
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
    // The offer's size comes from the appointments it actually carries — one
    // here — and must agree with `appointmentCount`. There is no stored
    // counter left to disagree with.
    expect(result[0]).toMatchObject({ groupSize: 1, appointmentCount: 1 });
  });

  it('excludes soft-deleted appointments from the offers list, matching the detail view', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'sg-1' }]);
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = new PrismaServiceGroupRepository({
      $queryRaw: queryRaw,
      serviceGroup: { findMany },
    } as any);

    await repo.findPublishedForInspector('inspector-1', ['st-1'], [], {
      page: 1,
      pageSize: 20,
      sortOrder: 'asc',
    });

    // Without this filter the list counted deleted appointments and summed
    // their payouts, so an offer card advertised more work and more money than
    // the detail view it opened into.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          appointments: expect.objectContaining({ where: { deleted_at: null } }),
        }),
      }),
    );
  });

  it('selects street and type so the offer card can show a full address and an icon', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'sg-1' }]);
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = new PrismaServiceGroupRepository({
      $queryRaw: queryRaw,
      serviceGroup: { findMany },
    } as any);

    await repo.findPublishedForInspector('inspector-1', ['st-1'], [], {
      page: 1,
      pageSize: 20,
      sortOrder: 'asc',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          appointments: expect.objectContaining({
            select: expect.objectContaining({
              property: {
                select: expect.objectContaining({ street: true, type: true }),
              },
            }),
          }),
        }),
      }),
    );
  });

  it('maps one properties entry per appointment, with suburb joined to state', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'sg-1' }]);
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'sg-1',
        group_number: 7,
        scheduled_date: new Date('2026-05-01'),
        time_window: '08:00-12:00',
        service_type: { name: 'Routine' },
        appointments: [
          {
            payout_amount: 50,
            tenant_id: 'tenant-1',
            tenant: { name: 'Agency A' },
            property: {
              street: '10 Main St',
              suburb: 'Bondi',
              state: 'NSW',
              type: 'APARTMENT',
              deleted_at: null,
            },
          },
          {
            payout_amount: 50,
            tenant_id: 'tenant-1',
            tenant: { name: 'Agency A' },
            property: {
              street: '20 Beach Rd',
              suburb: 'Coogee',
              state: 'NSW',
              type: 'HOUSE',
              deleted_at: null,
            },
          },
        ],
      },
    ]);
    const repo = new PrismaServiceGroupRepository({
      $queryRaw: queryRaw,
      serviceGroup: { findMany },
    } as any);

    const result = await repo.findPublishedForInspector('inspector-1', ['st-1'], [], {
      page: 1,
      pageSize: 20,
      sortOrder: 'asc',
    });

    expect(result[0]!.properties).toEqual([
      { street: '10 Main St', suburb: 'Bondi NSW', propertyType: 'APARTMENT' },
      { street: '20 Beach Rd', suburb: 'Coogee NSW', propertyType: 'HOUSE' },
    ]);
  });

  it('blanks a soft-deleted property but keeps its slot, so properties matches appointmentCount', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'sg-1' }]);
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'sg-1',
        group_number: 7,
        scheduled_date: new Date('2026-05-01'),
        time_window: '08:00-12:00',
        service_type: { name: 'Routine' },
        appointments: [
          {
            payout_amount: 50,
            tenant_id: 'tenant-1',
            tenant: { name: 'Agency A' },
            property: {
              street: '10 Main St',
              suburb: 'Bondi',
              state: 'NSW',
              type: 'APARTMENT',
              deleted_at: null,
            },
          },
          {
            payout_amount: 50,
            tenant_id: 'tenant-1',
            tenant: { name: 'Agency A' },
            // Never expose location data from a soft-deleted property — same
            // rule the offer-detail mapper applies to `street`.
            property: {
              street: '99 Secret Ln',
              suburb: 'Manly',
              state: 'NSW',
              type: 'HOUSE',
              deleted_at: new Date('2026-04-01'),
            },
          },
        ],
      },
    ]);
    const repo = new PrismaServiceGroupRepository({
      $queryRaw: queryRaw,
      serviceGroup: { findMany },
    } as any);

    const result = await repo.findPublishedForInspector('inspector-1', ['st-1'], [], {
      page: 1,
      pageSize: 20,
      sortOrder: 'asc',
    });

    expect(result[0]!.properties).toEqual([
      { street: '10 Main St', suburb: 'Bondi NSW', propertyType: 'APARTMENT' },
      { street: '', suburb: '', propertyType: null },
    ]);
    expect(result[0]!.properties).toHaveLength(result[0]!.appointmentCount);
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

describe('PrismaServiceGroupRepository offer centroid', () => {
  function makeAppointment(property: Record<string, unknown> | null) {
    return {
      key_required: false,
      payout_amount: 50,
      tenant_id: 'tenant-1',
      tenant: { name: 'Agency A' },
      property,
    };
  }

  function repoReturning(appointments: unknown[]) {
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'sg-1' }]);
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'sg-1',
        scheduled_date: new Date('2026-08-04'),
        time_window: '15:00-17:00',
        service_type: { name: 'Routine' },
        appointments,
      },
    ]);
    return {
      findMany,
      repo: new PrismaServiceGroupRepository({
        $queryRaw: queryRaw,
        serviceGroup: { findMany },
      } as any),
    };
  }

  const listOffers = (repo: PrismaServiceGroupRepository) =>
    repo.findPublishedForInspector('inspector-1', ['st-1'], [], {
      page: 1,
      pageSize: 20,
      sortOrder: 'asc',
    });

  it('selects property coordinates in the offers list query', async () => {
    const { findMany, repo } = repoReturning([]);

    await listOffers(repo);

    // The root cause of the missing-pin bug: the list query never fetched
    // lat/lng at all, so the centroid had to be guessed from the suburb name.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          appointments: expect.objectContaining({
            select: expect.objectContaining({
              property: {
                // deleted_at is asserted because the centroid filter reads it:
                // if the projection dropped it the field would be `undefined`,
                // `undefined == null` would pass the filter, and a soft-deleted
                // property's location would silently move the pin.
                select: expect.objectContaining({
                  lat: true,
                  lng: true,
                  deleted_at: true,
                }),
              },
            }),
          }),
        }),
      }),
    );
  });

  it('derives the centroid from the real property coordinates', async () => {
    const { repo } = repoReturning([
      makeAppointment({ suburb: 'Parramatta', state: 'NSW', lat: -33.8, lng: 151.0 }),
      makeAppointment({ suburb: 'Parramatta', state: 'NSW', lat: -33.6, lng: 151.2 }),
    ]);

    const result = await listOffers(repo);

    expect(result[0]!.centroid).toEqual({ lat: -33.7, lng: 151.1 });
  });

  // The production bug, reproduced: group #37 (Parramatta + Harris Park) and
  // group #34 (Parramatta) both resolved to the single Parramatta entry of a
  // 110-suburb lookup table, so their markers landed on byte-identical
  // coordinates and one hid the other. Distinct properties must yield distinct
  // pins regardless of which suburbs they happen to name.
  it('gives distinct centroids to groups that share a suburb', async () => {
    const both = await listOffers(
      repoReturning([
        makeAppointment({ suburb: 'Parramatta', state: 'NSW', lat: -33.8148, lng: 151.0017 }),
        makeAppointment({ suburb: 'Harris Park', state: 'NSW', lat: -33.8236, lng: 151.0053 }),
        makeAppointment({ suburb: 'Harris Park', state: 'NSW', lat: -33.8244, lng: 151.0061 }),
      ]).repo,
    );
    const parramattaOnly = await listOffers(
      repoReturning([
        makeAppointment({ suburb: 'Parramatta', state: 'NSW', lat: -33.8148, lng: 151.0017 }),
        makeAppointment({ suburb: 'Parramatta', state: 'NSW', lat: -33.8155, lng: 151.0022 }),
      ]).repo,
    );

    expect(both[0]!.centroid).not.toEqual(parramattaOnly[0]!.centroid);
  });

  it('resolves a centroid for suburbs absent from any lookup table', async () => {
    // "Harris Park" was not in the old hardcoded table; a group made only of
    // such suburbs got centroid: null and was dropped from the map in silence.
    const { repo } = repoReturning([
      makeAppointment({ suburb: 'Harris Park', state: 'NSW', lat: -33.8236, lng: 151.0053 }),
    ]);

    const result = await listOffers(repo);

    expect(result[0]!.centroid).toEqual({ lat: -33.8236, lng: 151.0053 });
  });

  it('excludes soft-deleted properties from the centroid', async () => {
    const { repo } = repoReturning([
      makeAppointment({ suburb: 'Parramatta', state: 'NSW', lat: -33.8, lng: 151.0 }),
      makeAppointment({
        suburb: 'Sydney',
        state: 'NSW',
        lat: -33.0,
        lng: 152.0,
        deleted_at: new Date('2026-07-01'),
      }),
    ]);

    const result = await listOffers(repo);

    // Never let a soft-deleted property pull the pin toward its location.
    expect(result[0]!.centroid).toEqual({ lat: -33.8, lng: 151.0 });
  });

  it('returns a null centroid when no property has coordinates', async () => {
    const { repo } = repoReturning([
      makeAppointment({ suburb: 'Parramatta', state: 'NSW', lat: null, lng: null }),
      makeAppointment(null),
    ]);

    const result = await listOffers(repo);

    expect(result[0]!.centroid).toBeNull();
  });

  it('still reports the suburb names alongside the coordinate-derived centroid', async () => {
    const { repo } = repoReturning([
      makeAppointment({ suburb: 'Parramatta', state: 'NSW', lat: -33.8148, lng: 151.0017 }),
      makeAppointment({ suburb: 'Harris Park', state: 'NSW', lat: -33.8236, lng: 151.0053 }),
    ]);

    const result = await listOffers(repo);

    // The card's "Parramatta · Harris Park" label is independent of the pin.
    expect(result[0]!.suburbs).toEqual(['Parramatta', 'Harris Park']);
  });

  // Group-level aggregates describe live properties. The per-appointment
  // `suburb` field deliberately still shows one (see the detail mapper), but a
  // removed property must not put a suburb on the offer card that nothing on
  // the map or in the address list backs up.
  it('excludes soft-deleted properties from the suburb list', async () => {
    const { repo } = repoReturning([
      makeAppointment({ suburb: 'Parramatta', state: 'NSW', lat: -33.8, lng: 151.0 }),
      makeAppointment({
        suburb: 'Sydney',
        state: 'NSW',
        lat: -33.0,
        lng: 152.0,
        deleted_at: new Date('2026-07-01'),
      }),
      // An appointment with no property at all must not contribute either.
      makeAppointment(null),
    ]);

    const result = await listOffers(repo);

    expect(result[0]!.suburbs).toEqual(['Parramatta']);
  });

  // The group-level `addresses` array re-emitted the street of a soft-deleted
  // property, contradicting the per-appointment `street` guard a few lines
  // below it — "Never expose location data from a soft-deleted property".
  it('keeps soft-deleted properties out of the detail suburbs and addresses', async () => {
    const appointment = (id: string, property: Record<string, unknown>) => ({
      id,
      appointment_number: Number(id.slice(-1)),
      key_required: false,
      payout_amount: 50,
      notes: null,
      time_slot_start: '15:00',
      time_slot_end: '17:00',
      tenant_id: 'tenant-1',
      tenant: { name: 'Agency A', appointment_code_prefix: 'INS' },
      property,
    });
    const findUnique = vi.fn().mockResolvedValue({
      id: 'sg-1',
      group_number: 37,
      scheduled_date: new Date('2026-08-04'),
      time_window: '15:00-17:00',
      service_type: { name: 'Routine' },
      appointments: [
        appointment('appt-1', {
          deleted_at: null,
          suburb: 'Harris Park',
          state: 'NSW',
          street: '1 Main St',
          type: 'APARTMENT',
          lat: -33.8,
          lng: 151.0,
        }),
        appointment('appt-2', {
          deleted_at: new Date('2026-07-01'),
          suburb: 'Sydney',
          state: 'NSW',
          street: '99 Secret Lane',
          type: 'HOUSE',
          lat: -33.0,
          lng: 152.0,
        }),
      ],
    });
    const repo = new PrismaServiceGroupRepository({
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'sg-1' }]),
      serviceGroup: { findUnique },
    } as any);

    const detail = await repo.findPublishedOfferDetail('sg-1', 'inspector-1', ['st-1'], []);

    expect(detail?.suburbs).toEqual(['Harris Park']);
    expect(detail?.addresses).toEqual(['1 Main St, Harris Park']);
    expect(JSON.stringify(detail)).not.toContain('99 Secret Lane');
    // The per-appointment guards this aligns with, asserted rather than assumed.
    expect(detail?.appointments[1]!.street).toBe('');
    expect(detail?.appointments[1]!.coordinates).toBeNull();
    // The per-appointment suburb stays visible — that is the documented rule,
    // and this test must not be read as changing it.
    expect(detail?.appointments[1]!.suburb).toBe('Sydney NSW');
    // propertyType follows `street`, not `suburb`: it describes the property
    // itself, so a soft-deleted one reveals nothing.
    expect(detail?.appointments[0]!.propertyType).toBe('APARTMENT');
    expect(detail?.appointments[1]!.propertyType).toBeNull();
  });

  it('derives the offer detail centroid from real coordinates too', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'sg-1',
      group_number: 37,
      scheduled_date: new Date('2026-08-04'),
      time_window: '15:00-17:00',
      service_type: { name: 'Routine' },
      appointments: [
        {
          id: 'appt-1',
          appointment_number: 1,
          key_required: false,
          payout_amount: 50,
          notes: null,
          time_slot_start: '15:00',
          time_slot_end: '17:00',
          tenant_id: 'tenant-1',
          tenant: { name: 'Agency A', appointment_code_prefix: 'INS' },
          property: {
            deleted_at: null,
            suburb: 'Harris Park',
            state: 'NSW',
            street: '1 Main St',
            lat: -33.8,
            lng: 151.0,
          },
        },
        {
          id: 'appt-2',
          appointment_number: 2,
          key_required: false,
          payout_amount: 50,
          notes: null,
          time_slot_start: '15:00',
          time_slot_end: '17:00',
          tenant_id: 'tenant-1',
          tenant: { name: 'Agency A', appointment_code_prefix: 'INS' },
          property: {
            deleted_at: null,
            suburb: 'Harris Park',
            state: 'NSW',
            street: '2 Main St',
            lat: -33.6,
            lng: 151.2,
          },
        },
      ],
    });
    const repo = new PrismaServiceGroupRepository({
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'sg-1' }]),
      serviceGroup: { findUnique },
    } as any);

    const detail = await repo.findPublishedOfferDetail('sg-1', 'inspector-1', ['st-1'], []);

    // Same projection contract as the list query above — the detail centroid
    // runs through the same soft-delete filter.
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          appointments: expect.objectContaining({
            select: expect.objectContaining({
              property: {
                select: expect.objectContaining({
                  lat: true,
                  lng: true,
                  deleted_at: true,
                }),
              },
            }),
          }),
        }),
      }),
    );
    expect(detail?.centroid).toEqual({ lat: -33.7, lng: 151.1 });
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

  it('asks for a soft-delete-filtered relation count and maps it onto groupSize', async () => {
    // Its own mock: returning a row makes findAll also derive agencies, which
    // queries `appointment` — a table the shared mock above does not stub.
    const groupFindMany = vi.fn().mockResolvedValue([
      {
        id: 'sg-1',
        group_number: 7,
        service_type_id: 'st-1',
        status: 'PUBLISHED',
        offered_count: 0,
        confirmed_count: 0,
        scheduled_date: new Date('2026-05-01'),
        time_window: '08:00-12:00',
        assigned_inspector_id: null,
        service_region_id: null,
        published_at: null,
        assigned_at: null,
        created_by_user_id: 'user-1',
        created_at: new Date('2026-04-01'),
        updated_at: new Date('2026-04-01'),
        _count: { appointments: 4 },
      },
    ]);
    const repo = new PrismaServiceGroupRepository({
      serviceGroup: { findMany: groupFindMany, count: vi.fn() },
      appointment: { findMany: vi.fn().mockResolvedValue([]) },
    } as any);

    const rows = await repo.findAll({}, { page: 1, pageSize: 10, sortOrder: 'asc' });

    // The list does not fetch appointment rows, so the size has to come from a
    // count — and that count must exclude soft-deleted appointments, which stay
    // linked to their group after `delete-appointment` runs.
    expect(groupFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: { select: { appointments: { where: { deleted_at: null } } } },
        }),
      }),
    );
    expect(rows[0]!.group.groupSize).toBe(4);
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

  it('returns mapped group members when rows found', async () => {
    const { repo } = makeRepo([
      {
        group_id: 'sg-1',
        scheduled_date: new Date('2026-05-30'),
        time_slot_start: '13:00',
        time_slot_end: '15:00',
        suburb: 'Surry Hills',
        inspector_name: 'John Smith',
        is_own_agency: true,
      },
      {
        group_id: 'sg-1',
        scheduled_date: new Date('2026-05-30'),
        time_slot_start: '13:00',
        time_slot_end: '15:00',
        suburb: 'Redfern',
        inspector_name: 'John Smith',
        is_own_agency: false,
      },
    ]);

    const result = await repo.findPortalEligibleSlots({
      tenantId: 'tenant-1',
      serviceTypeId: 'stype-1',
      propertyId: 'prop-1',
      today: TODAY,
    });

    // One row per member, not one per time slot — the capacity rule needs them all.
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      groupId: 'sg-1',
      timeSlotStart: '13:00',
      timeSlotEnd: '15:00',
      suburb: 'Surry Hills',
      inspectorName: 'John Smith',
      isOwnAgency: true,
    });
    expect(result[1]).toMatchObject({ suburb: 'Redfern', isOwnAgency: false });
    expect(result[0]!.scheduledDate).toEqual(new Date('2026-05-30'));
  });

  it('enumerates active members and drops the retired confirmed_count cap', async () => {
    const { repo, queryRaw } = makeRepo([]);
    await repo.findPortalEligibleSlots({
      tenantId: 'tenant-1',
      serviceTypeId: 'stype-1',
      propertyId: 'prop-1',
      today: TODAY,
    });

    const [strings] = queryRaw.mock.calls[0] as [string[]];
    const sqlText = strings.join('');
    expect(sqlText).toContain('is_own_agency');
    expect(sqlText).toContain("a.status NOT IN ('CANCELLED', 'REJECTED')");
    // The portal-only cap of 10 is gone; capacity is derived per window instead.
    expect(sqlText).not.toContain('confirmed_count');
    // Members are no longer collapsed per time slot.
    expect(sqlText).not.toContain('GROUP BY');
    // That the member enumeration is *not* tenant-filtered (so cross-agency
    // members still count) is proven against real Postgres in
    // tests/integration/db/portal-eligible-member-slots.integration.test.ts.
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

  // Nested Prisma.sql fragments arrive as Sql values on the tagged-template
  // mock, so the full query text spans the strings array plus any Sql values.
  function fullSqlText(call: unknown[]): string {
    const [strings, ...values] = call as [string[], ...unknown[]];
    const fragmentText = values
      .filter((v): v is { strings: string[]; values: unknown[] } =>
        typeof v === 'object' && v !== null && 'strings' in v)
      .map((v) => v.strings.join('') + v.values.map(String).join(''))
      .join('');
    return strings.join('') + fragmentText;
  }

  it('excludes the given group when excludeGroupId is provided', async () => {
    const { repo, queryRaw } = makeRepo([]);
    await repo.findPortalEligibleSlots({
      tenantId: 'tenant-1',
      serviceTypeId: 'stype-1',
      propertyId: 'prop-1',
      today: TODAY,
      excludeGroupId: 'sg-own',
    });

    const sqlText = fullSqlText(queryRaw.mock.calls[0]);
    expect(sqlText).toContain('sg.id <>');
    expect(sqlText).toContain('sg-own');
  });

  it('does not add an exclusion clause when excludeGroupId is absent', async () => {
    const { repo, queryRaw } = makeRepo([]);
    await repo.findPortalEligibleSlots({
      tenantId: 'tenant-1',
      serviceTypeId: 'stype-1',
      propertyId: 'prop-1',
      today: TODAY,
    });

    const sqlText = fullSqlText(queryRaw.mock.calls[0]);
    expect(sqlText).not.toContain('sg.id <>');
  });
});

describe('PrismaServiceGroupRepository.findById schedule projection', () => {
  const GROUP_ROW = {
    id: 'sg-1',
    group_number: 42,
    service_type_id: 'stype-1',
    status: 'PUBLISHED',
    offered_count: 0,
    confirmed_count: 0,
    scheduled_date: new Date('2026-05-01'),
    time_window: '08:00-16:00',
    region_name: null,
    description: null,
    assigned_inspector_id: null,
    service_region_id: null,
    published_at: null,
    assigned_at: null,
    created_by_user_id: 'user-1',
    created_at: new Date('2026-04-01'),
    updated_at: new Date('2026-04-01'),
    assigned_inspector: null,
    appointments: [
      {
        id: 'apt-1',
        appointment_number: 1001,
        status: 'AWAITING_INSPECTOR',
        service_type_id: 'stype-1',
        tenant_id: 'tenant-1',
        property_id: 'prop-1',
        service_group_id: 'sg-1',
        scheduled_date: new Date('2026-05-01'),
        time_slot_start: '07:00',
        time_slot_end: '08:30',
        rental_tenant_confirmation_status: 'CONFIRMED',
        active_confirmation_cycle_id: 'cycle-1',
        property: { street: '10 Main St', suburb: 'Bondi', property_code: 'AG-PROP-0001' },
      },
    ],
  };

  function makeRepo() {
    const findFirst = vi.fn().mockResolvedValue(GROUP_ROW);
    const repo = new PrismaServiceGroupRepository({ serviceGroup: { findFirst } } as any);
    return { repo, findFirst };
  }

  it('selects the time slot and confirmation columns member appointments need', async () => {
    const { repo, findFirst } = makeRepo();

    await repo.findById('sg-1', null);

    const select = findFirst.mock.calls[0][0].include.appointments.select;
    expect(select).toMatchObject({
      time_slot_start: true,
      time_slot_end: true,
      rental_tenant_confirmation_status: true,
      active_confirmation_cycle_id: true,
    });
  });

  it('keeps excluding soft-deleted members from the projection', async () => {
    const { repo, findFirst } = makeRepo();

    await repo.findById('sg-1', null);

    expect(findFirst.mock.calls[0][0].include.appointments.where).toEqual({ deleted_at: null });
  });

  it('maps the schedule and confirmation fields onto each member', async () => {
    const { repo } = makeRepo();

    const result = await repo.findById('sg-1', null);

    expect(result!.appointments[0]).toMatchObject({
      id: 'apt-1',
      timeSlotStart: '07:00',
      timeSlotEnd: '08:30',
      rentalTenantConfirmationStatus: 'CONFIRMED',
      activeConfirmationCycleId: 'cycle-1',
    });
  });
});

describe('PrismaServiceGroupRepository.assignInspectorToGroupAppointments', () => {
  function makeRepo(counts: number[]) {
    const updateMany = vi.fn();
    counts.forEach((count) => updateMany.mockResolvedValueOnce({ count }));
    const $transaction = vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
    const repo = new PrismaServiceGroupRepository({
      appointment: { updateMany },
      $transaction,
    } as any);
    return { repo, updateMany, $transaction };
  }

  it('swaps the inspector on SCHEDULED members without touching their status', async () => {
    const { repo, updateMany } = makeRepo([3, 0]);

    await repo.assignInspectorToGroupAppointments('sg-1', 'insp-new');

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { service_group_id: 'sg-1', status: 'SCHEDULED', deleted_at: null },
      data: { inspector_id: 'insp-new' },
    });
  });

  it('schedules members still waiting for an inspector', async () => {
    const { repo, updateMany } = makeRepo([0, 2]);

    await repo.assignInspectorToGroupAppointments('sg-1', 'insp-new');

    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { service_group_id: 'sg-1', status: 'AWAITING_INSPECTOR', deleted_at: null },
      data: { status: 'SCHEDULED', inspector_id: 'insp-new' },
    });
  });

  it('runs both writes in one transaction and returns each count', async () => {
    const { repo, $transaction } = makeRepo([3, 2]);

    const result = await repo.assignInspectorToGroupAppointments('sg-1', 'insp-new');

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ reassigned: 3, scheduled: 2 });
  });
});
