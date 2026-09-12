/**
 * Real-database uniqueness tests for the (global) service-type catalog (#732, #393).
 *
 * Proves against Postgres that:
 *  - an INACTIVE service type still reserves its code, so a create with the same
 *    code is rejected (findByCodeAnyStatus, not the ACTIVE-only findByCode);
 *  - name uniqueness is case-insensitive (findByName mode: 'insensitive').
 *
 * service_types is a global platform catalog (no tenant_id), so there is no
 * cross-tenant case — the conflict is global.
 *
 * Run via: `pnpm --filter backend exec vitest run --config vitest.integration-db.config.ts tests/integration/db/service-type-uniqueness.integration.test.ts`
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaServiceTypeRepository } from '../../../src/modules/service-type/infrastructure/prisma-service-type.repository';
import { CreateServiceTypeUseCase } from '../../../src/modules/service-type/application/use-cases/create-service-type.use-case';
import {
  ServiceTypeCodeConflictError,
  ServiceTypeNameConflictError,
} from '../../../src/modules/service-type/domain/service-type.errors';
import type { AuthContext } from '@properfy/shared';

function silentAuditService() {
  return { log: () => {} } as any;
}

let harness: DbHarness;
let repo: PrismaServiceTypeRepository;
let useCase: CreateServiceTypeUseCase;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaServiceTypeRepository(harness.prisma);
  useCase = new CreateServiceTypeUseCase(repo, silentAuditService());
  // Container boot + `migrate deploy` can exceed 120s on a loaded machine.
}, 240_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  // service_types is global and nothing else is seeded referencing it here.
  await harness.prisma.serviceType.deleteMany({});
});

const AM: AuthContext = { userId: 'am-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

describe('#393/#732 — global service-type uniqueness', () => {
  it('rejects a create reusing the code of an INACTIVE service type', async () => {
    await harness.prisma.serviceType.create({
      data: {
        code: 'DUPCODE',
        name: 'Retired Type',
        flow_type: 'ROUTINE',
        requires_rental_tenant_confirmation: true,
        status: 'INACTIVE',
      },
    });

    await expect(
      useCase.execute({
        code: 'DUPCODE',
        name: 'Brand New Type',
        flowType: 'ROUTINE',
        requiresRentalTenantConfirmation: false,
        actor: AM,
      }),
    ).rejects.toBeInstanceOf(ServiceTypeCodeConflictError);
  });

  it('rejects a create whose name is a case-variant of an existing type', async () => {
    await harness.prisma.serviceType.create({
      data: {
        code: 'ROUTINE',
        name: 'Routine Inspection',
        flow_type: 'ROUTINE',
        requires_rental_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });

    await expect(
      useCase.execute({
        code: 'ROUTINE_2',
        name: 'routine inspection',
        flowType: 'ROUTINE',
        requiresRentalTenantConfirmation: false,
        actor: AM,
      }),
    ).rejects.toBeInstanceOf(ServiceTypeNameConflictError);
  });

  it('allows a create with a distinct code and name', async () => {
    const result = await useCase.execute({
      code: 'INGOING',
      name: 'Ingoing Inspection',
      flowType: 'INGOING',
      requiresRentalTenantConfirmation: false,
      actor: AM,
    });

    expect(result.code).toBe('INGOING');
    expect(result.status).toBe('ACTIVE');
  });
});
