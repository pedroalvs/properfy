import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetContactUseCase } from '../../../src/modules/contact/application/use-cases/get-contact.use-case';
import { ContactNotFoundError } from '../../../src/modules/contact/domain/contact.errors';
import type { IContactRepository } from '../../../src/modules/contact/domain/contact.repository';

const TENANT_Y = 'aaaaaaaa-0000-0000-0000-000000000010';
const TENANT_Z = 'bbbbbbbb-0000-0000-0000-000000000020';
const CONTACT_ID = 'cccccccc-0000-0000-0000-000000000001';

function makeContact(tenantId: string | null) {
  return {
    id: CONTACT_ID,
    tenantId,
    type: 'PROPERTY_MANAGER',
    displayName: 'Pat Manager',
    company: null,
    primaryEmail: 'pat@example.com',
    primaryPhone: null,
    additionalChannels: [],
    notes: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Awaited<ReturnType<IContactRepository['findById']>>;
}

function makeRepo(): IContactRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    search: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    existsByEmail: vi.fn(),
    existsByPhone: vi.fn(),
    findActiveByEmailOrPhone: vi.fn(),
    existsLinkedToTenant: vi.fn(),
    findAppointmentsByContactId: vi.fn(),
    countAppointmentsByContactId: vi.fn(),
    countDistinctPropertiesByContactIds: vi.fn(),
    countPrimaryDistinctPropertiesByContactIds: vi.fn(),
    findPropertiesByContactId: vi.fn(),
    countPropertiesByContactId: vi.fn(),
  } as unknown as IContactRepository;
}

/**
 * 024 §FR-303 — for CL_ADMIN/CL_USER, GetContactUseCase enforces the
 * operational-junction visibility check post-fetch. The 404 collapse
 * (`ContactNotFoundError` for both "not found" and "found but invisible")
 * preserves 021 FR-022 — never leak existence of out-of-tenant rows.
 */
describe('GetContactUseCase — CL visibility check (024 §FR-303)', () => {
  let repo: IContactRepository;
  let useCase: GetContactUseCase;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new GetContactUseCase(repo);
  });

  it('throws ContactNotFoundError for CL_ADMIN(Z) on a contact only linked to tenant Y', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeContact(TENANT_Y));
    (repo.existsLinkedToTenant as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(
      useCase.execute(CONTACT_ID, TENANT_Z, {
        actor: { role: 'CL_ADMIN', tenantId: TENANT_Z },
      }),
    ).rejects.toBeInstanceOf(ContactNotFoundError);

    expect(repo.existsLinkedToTenant).toHaveBeenCalledWith(CONTACT_ID, TENANT_Z);
  });

  it('returns the contact for CL_ADMIN(Y) on a Y-OWNED contact via the ownsContact fast path (no junction call)', async () => {
    // Review fix — Issue 1: `ownsContact` (registry tenantId === actor
    // tenantId) short-circuits the junction lookup. Use case must NOT
    // call `existsLinkedToTenant` in this case.
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeContact(TENANT_Y));

    const result = await useCase.execute(CONTACT_ID, TENANT_Y, {
      actor: { role: 'CL_ADMIN', tenantId: TENANT_Y },
    });

    expect(result.contact.id).toBe(CONTACT_ID);
    expect(repo.existsLinkedToTenant).not.toHaveBeenCalled();
  });

  it('returns the contact for CL_ADMIN(Y) on a CROSS-tenant contact reachable via the operational junction', async () => {
    // Registry row lives in TENANT_Z (not Y); ownsContact false → falls
    // through to existsLinkedToTenant which the seed says is true.
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeContact(TENANT_Z));
    (repo.existsLinkedToTenant as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const result = await useCase.execute(CONTACT_ID, TENANT_Y, {
      actor: { role: 'CL_ADMIN', tenantId: TENANT_Y },
    });

    expect(result.contact.id).toBe(CONTACT_ID);
    expect(repo.existsLinkedToTenant).toHaveBeenCalledWith(CONTACT_ID, TENANT_Y);
    // Findlookup is always global now (Issue 1 fix).
    expect(repo.findById).toHaveBeenCalledWith(CONTACT_ID, null);
  });

  it('skips the visibility check for AM (global scope)', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeContact(TENANT_Y));

    const result = await useCase.execute(CONTACT_ID, null, {
      actor: { role: 'AM', tenantId: null },
    });

    expect(result.contact.id).toBe(CONTACT_ID);
    expect(repo.existsLinkedToTenant).not.toHaveBeenCalled();
  });

  it('skips the visibility check for OP (global scope)', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeContact(TENANT_Y));

    const result = await useCase.execute(CONTACT_ID, null, {
      actor: { role: 'OP', tenantId: null },
    });

    expect(result.contact.id).toBe(CONTACT_ID);
    expect(repo.existsLinkedToTenant).not.toHaveBeenCalled();
  });

  it('CL aggregations receive scopeTenantId so sub-resources only show visible appointments/properties', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeContact(TENANT_Y));
    (repo.existsLinkedToTenant as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (repo.findAppointmentsByContactId as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (repo.countAppointmentsByContactId as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (repo.findPropertiesByContactId as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (repo.countPropertiesByContactId as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await useCase.execute(CONTACT_ID, TENANT_Y, {
      actor: { role: 'CL_ADMIN', tenantId: TENANT_Y },
      includeAppointments: true,
      includeProperties: true,
    });

    expect(repo.findAppointmentsByContactId).toHaveBeenCalledWith(CONTACT_ID, expect.any(Object), TENANT_Y);
    expect(repo.countAppointmentsByContactId).toHaveBeenCalledWith(CONTACT_ID, TENANT_Y);
    expect(repo.findPropertiesByContactId).toHaveBeenCalledWith(CONTACT_ID, expect.any(Object), TENANT_Y);
    expect(repo.countPropertiesByContactId).toHaveBeenCalledWith(CONTACT_ID, TENANT_Y);
  });
});
