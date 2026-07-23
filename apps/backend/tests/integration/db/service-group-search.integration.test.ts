/**
 * Service-group list search — real-database verification.
 *
 * The map page (Groups mode) sends the Search input to
 * `GET /v1/service-groups?search=…`. The filter is a Prisma `where` clause in
 * `PrismaServiceGroupRepository.buildWhere`, so a mocked repository would pass
 * regardless of what the OR actually matches — this proves it on PostgreSQL.
 *
 * What's covered:
 *   1. Searching by the group code (numeric `group_number`) returns the group.
 *   2. Searching by description substring still works.
 *   3. A numeric search also matches descriptions containing that digit string
 *      (OR semantics — code match must not replace the description match).
 *   4. A non-matching search returns nothing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import type { PaginationParams } from '../../../src/modules/service-group/domain/service-group.repository';
import { futureDateStr } from '../../helpers/date-fixtures';

const PAGINATION: PaginationParams = { page: 1, pageSize: 50, sortOrder: 'desc' };

describe('service group search filter (real DB)', () => {
  let harness: DbHarness | undefined;
  let prisma: PrismaClient;
  let repo: PrismaServiceGroupRepository;
  let userId: string;
  let serviceTypeId: string;
  let plainGroupId: string;
  let plainGroupNumber: number;
  let describedGroupId: string;

  async function seedGroup(description: string | null): Promise<{ id: string; groupNumber: number }> {
    const group = await prisma.serviceGroup.create({
      data: {
        service_type_id: serviceTypeId,
        status: 'DRAFT',
        group_size: 1,
        scheduled_date: new Date(futureDateStr(30)),
        time_window: '09:00-12:00',
        description,
        created_by_user_id: userId,
      },
    });
    return { id: group.id, groupNumber: group.group_number };
  }

  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma = harness.prisma;
    repo = new PrismaServiceGroupRepository(prisma);

    const suffix = Math.random().toString(36).slice(2, 10);
    const tenant = await prisma.tenant.create({
      data: { name: 'SGSF Tenant', legal_name: `SGSF LLC ${suffix}`, status: 'ACTIVE' },
    });
    const user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        role: 'OP',
        name: 'SGSF Actor',
        email: `sgsf-${suffix}@test.local`,
        password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
        status: 'ACTIVE',
      },
    });
    userId = user.id;
    const serviceType = await prisma.serviceType.create({
      data: {
        code: `SGSF-ST-${suffix}`,
        name: `SGSF Routine ${suffix}`,
        flow_type: 'ROUTINE',
        requires_rental_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });
    serviceTypeId = serviceType.id;

    const plain = await seedGroup(null);
    plainGroupId = plain.id;
    plainGroupNumber = plain.groupNumber;
    const described = await seedGroup(`Sylvania sweep ${plain.groupNumber}`);
    describedGroupId = described.id;
  }, 120_000);

  afterAll(async () => {
    if (harness) await teardownDbHarness(harness);
  });

  it('matches a group by its numeric code (group_number)', async () => {
    const rows = await repo.findAll({ search: String(plainGroupNumber) }, PAGINATION);
    expect(rows.map((r) => r.group.id)).toContain(plainGroupId);
  });

  it('matches a group by description substring, case-insensitively', async () => {
    const rows = await repo.findAll({ search: 'sylvania SWEEP' }, PAGINATION);
    const ids = rows.map((r) => r.group.id);
    expect(ids).toContain(describedGroupId);
    expect(ids).not.toContain(plainGroupId);
  });

  it('numeric search keeps OR semantics: matches code AND descriptions containing the digits', async () => {
    const rows = await repo.findAll({ search: String(plainGroupNumber) }, PAGINATION);
    const ids = rows.map((r) => r.group.id);
    expect(ids).toContain(plainGroupId);
    expect(ids).toContain(describedGroupId);
  });

  it('returns nothing for a search matching neither code nor description', async () => {
    const rows = await repo.findAll({ search: 'zzz-no-such-group-999999999' }, PAGINATION);
    expect(rows.map((r) => r.group.id)).not.toContain(plainGroupId);
    expect(rows.map((r) => r.group.id)).not.toContain(describedGroupId);
  });
});
