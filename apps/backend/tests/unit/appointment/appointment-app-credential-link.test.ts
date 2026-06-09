/**
 * Unit guard for CreateAppointmentUseCase ↔ app-credential linking.
 *
 * SCOPE: proves the use case validates tenant ownership + active state and
 * persists the junction. The tenant check is in-memory over `findByIds`
 * results (no SQL tenant filter to mask), so a mocked repo is the right tool
 * here; the SQL round-trip is covered separately by the real-DB test
 * `tests/integration/db/app-credential.integration.test.ts`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/create-appointment.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { NotFoundError, ValidationError } from '../../../src/shared/domain/errors';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { PricingRuleEntity } from '../../../src/modules/pricing-rule/domain/pricing-rule.entity';
import { AppCredentialEntity } from '../../../src/modules/app-credential/domain/app-credential.entity';
import type { IAppCredentialRepository } from '../../../src/modules/app-credential/domain/app-credential.repository';
import type { AuthContext } from '@properfy/shared';
import { futureDateStr } from '../../helpers/date-fixtures';

const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const BRANCH_B = 'bbbbbbbb-0000-4000-8000-000000000010';
const PROPERTY_B = 'bbbbbbbb-0000-4000-8000-000000000020';

function cred(id: string, tenantId: string, isActive = true) {
  return new AppCredentialEntity({
    id, tenantId, name: `App-${id}`, username: 'u', password: 'p',
    isActive, createdAt: new Date(), updatedAt: new Date(),
  });
}

function makeRepos() {
  const appointmentRepo = {
    save: vi.fn(), saveContact: vi.fn(), saveRestriction: vi.fn(),
  } as any;
  const branchRepo = {
    findById: vi.fn().mockResolvedValue(new BranchEntity({
      id: BRANCH_B, tenantId: TENANT_B, name: 'B', addressJson: null, contactEmail: null,
      status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    })),
  } as any;
  const propertyRepo = {
    findById: vi.fn().mockResolvedValue(new PropertyEntity({
      id: PROPERTY_B, tenantId: TENANT_B, branchId: BRANCH_B, propertyCode: 'P-1',
      type: 'RESIDENTIAL', street: '1 St', addressLine2: null, suburb: 'S', postcode: '2000',
      state: 'NSW', country: 'AU', lat: null, lng: null, geocodingStatus: 'PENDING',
      notes: null, rulesJson: {}, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    })),
  } as any;
  const serviceTypeRepo = {
    findById: vi.fn().mockResolvedValue(new ServiceTypeEntity({
      id: 'svc-type-1', code: 'ROUTINE', name: 'Routine', flowType: 'STANDARD',
      requiresTenantConfirmation: false, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date(),
    })),
  } as any;
  const pricingRuleRepo = {
    findAll: vi.fn().mockResolvedValue([new PricingRuleEntity({
      id: 'pricing-1', tenantId: TENANT_B, currency: 'AUD', serviceTypeId: 'svc-type-1',
      branchId: null, priceAmount: 150, payoutType: 'FIXED', payoutValue: 80,
      bonusRuleJson: null, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date(),
    })],
    ),
  } as any;
  const appCredentialRepo: IAppCredentialRepository = {
    findById: vi.fn(), findAll: vi.fn(), count: vi.fn(), search: vi.fn(),
    save: vi.fn(), update: vi.fn(), findByIds: vi.fn(),
    findByAppointmentId: vi.fn(), replaceAppointmentLinks: vi.fn(),
  } as unknown as IAppCredentialRepository;
  const auditService = { log: vi.fn() } as any;
  return { appointmentRepo, branchRepo, propertyRepo, serviceTypeRepo, pricingRuleRepo, appCredentialRepo, auditService };
}

function makeActor(): AuthContext {
  return { userId: 'user-1', tenantId: TENANT_B, role: 'AM', branchId: null, inspectorId: null } as AuthContext;
}

const baseInput = {
  branchId: BRANCH_B, propertyId: PROPERTY_B, serviceTypeId: 'svc-type-1',
  scheduledDate: futureDateStr(60), timeSlot: '09:00-10:00', keyRequired: false,
  contacts: [{ contactId: undefined, inline: { type: 'TENANT', displayName: 'Pat', primaryEmail: 'p@x.com' }, role: 'TENANT', isPrimary: true }] as any,
};

describe('CreateAppointmentUseCase — app-credential linking', () => {
  let repos: ReturnType<typeof makeRepos>;
  let useCase: CreateAppointmentUseCase;

  beforeEach(() => {
    repos = makeRepos();
    // Inline contact reuse path: no existing match → create a fresh contact.
    (repos as any).contactRepo = { findActiveByEmailOrPhone: vi.fn().mockResolvedValue(null), save: vi.fn() };
    useCase = new CreateAppointmentUseCase(
      repos.appointmentRepo, repos.branchRepo, repos.propertyRepo, repos.serviceTypeRepo, repos.pricingRuleRepo,
      { execute: vi.fn() } as any, repos.auditService, new AuthorizationService(repos.auditService),
      undefined, undefined, (repos as any).contactRepo, undefined, undefined, repos.appCredentialRepo,
    );
  });

  it('links active same-tenant credentials and returns them in the output', async () => {
    const c1 = cred('11111111-0000-4000-8000-000000000001', TENANT_B);
    const c2 = cred('22222222-0000-4000-8000-000000000002', TENANT_B);
    vi.mocked(repos.appCredentialRepo.findByIds).mockResolvedValue([c1, c2]);

    const result = await useCase.execute({
      ...baseInput, appCredentialIds: [c1.id, c2.id], actor: makeActor(),
    } as any);

    expect(repos.appCredentialRepo.replaceAppointmentLinks).toHaveBeenCalledWith(result.id, [c1.id, c2.id]);
    expect(result.apps.map((a) => a.id)).toEqual([c1.id, c2.id]);
    expect(result.apps[0]!.name).toBe(c1.name);
  });

  it('rejects a credential from another tenant with a 404 (no leakage)', async () => {
    const foreign = cred('33333333-0000-4000-8000-000000000003', TENANT_A);
    vi.mocked(repos.appCredentialRepo.findByIds).mockResolvedValue([foreign]);

    await expect(
      useCase.execute({ ...baseInput, appCredentialIds: [foreign.id], actor: makeActor() } as any),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repos.appCredentialRepo.replaceAppointmentLinks).not.toHaveBeenCalled();
  });

  it('rejects an inactive credential', async () => {
    const inactive = cred('44444444-0000-4000-8000-000000000004', TENANT_B, false);
    vi.mocked(repos.appCredentialRepo.findByIds).mockResolvedValue([inactive]);

    await expect(
      useCase.execute({ ...baseInput, appCredentialIds: [inactive.id], actor: makeActor() } as any),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('leaves apps empty when no appCredentialIds are provided', async () => {
    const result = await useCase.execute({ ...baseInput, actor: makeActor() } as any);
    expect(result.apps).toEqual([]);
    expect(repos.appCredentialRepo.replaceAppointmentLinks).not.toHaveBeenCalled();
  });
});
