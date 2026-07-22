import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ListContactsUseCase,
  resolveScope,
} from '../../../src/modules/contact/application/use-cases/list-contacts.use-case';
import type { IContactRepository } from '../../../src/modules/contact/domain/contact.repository';
import type { ContactScope } from '../../../src/modules/contact/domain/contact.scope';

const TENANT_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-0000-0000-000000000002';

/**
 * 024 §FR-303 — `resolveScope` is the single source of truth for the
 * visibility scope used by both list and get use cases. CL_* roles map
 * to a `tenant_pinned` scope (operational-junction predicate); AM/OP
 * map to `global` (with optional Agency-selector pin via the explicit
 * tenantId from the route layer).
 */
describe('resolveScope (024 §FR-303)', () => {
  it('AM without explicit tenantId resolves to global with explicitTenantId=null', () => {
    const scope = resolveScope({ role: 'AM', tenantId: null });
    expect(scope).toEqual({ kind: 'global', explicitTenantId: null });
  });

  it('AM with explicit tenantId resolves to global with explicitTenantId pinned', () => {
    const scope = resolveScope({ role: 'AM', tenantId: null }, TENANT_B);
    expect(scope).toEqual({ kind: 'global', explicitTenantId: TENANT_B });
  });

  it('OP without explicit tenantId resolves to global with explicitTenantId=null', () => {
    const scope = resolveScope({ role: 'OP', tenantId: null });
    expect(scope).toEqual({ kind: 'global', explicitTenantId: null });
  });

  it('OP with explicit tenantId resolves to global with explicitTenantId pinned', () => {
    const scope = resolveScope({ role: 'OP', tenantId: null }, TENANT_A);
    expect(scope).toEqual({ kind: 'global', explicitTenantId: TENANT_A });
  });

  it('CL_ADMIN resolves to tenant_pinned at the actor JWT tenant — query.tenantId is ignored', () => {
    const scope = resolveScope({ role: 'CL_ADMIN', tenantId: TENANT_A }, TENANT_B);
    expect(scope).toEqual({ kind: 'tenant_pinned', tenantId: TENANT_A });
  });

  it('CL_USER resolves to tenant_pinned at the actor JWT tenant — query.tenantId is ignored', () => {
    const scope = resolveScope({ role: 'CL_USER', tenantId: TENANT_A }, TENANT_B);
    expect(scope).toEqual({ kind: 'tenant_pinned', tenantId: TENANT_A });
  });

  it('CL_ADMIN without a JWT tenantId throws — defence in depth for misconfigured tokens', () => {
    expect(() => resolveScope({ role: 'CL_ADMIN', tenantId: null }))
      .toThrow(/missing tenantId/);
  });

  it('CL_USER without a JWT tenantId throws — defence in depth for misconfigured tokens', () => {
    expect(() => resolveScope({ role: 'CL_USER', tenantId: null }))
      .toThrow(/missing tenantId/);
  });
});

/**
 * Verifies the use case threads the resolved scope (and `scopeTenantId`
 * for CL roles) into the repository. Repository is fully mocked — we
 * inspect the arguments it received.
 */
describe('ListContactsUseCase scope threading (024 §FR-303)', () => {
  function makeRepoMock(): IContactRepository {
    return {
      findById: vi.fn(),
      findAll: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      search: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      existsByEmail: vi.fn(),
      existsByPhone: vi.fn(),
      findManyActiveByEmailsOrPhones: vi.fn().mockResolvedValue([]),
      existsLinkedToTenant: vi.fn(),
      findAppointmentsByContactId: vi.fn(),
      countAppointmentsByContactId: vi.fn(),
      countDistinctPropertiesByContactIds: vi.fn().mockResolvedValue(new Map()),
      countPrimaryDistinctPropertiesByContactIds: vi.fn().mockResolvedValue(new Map()),
      findPropertiesByContactId: vi.fn(),
      countPropertiesByContactId: vi.fn(),
    } as unknown as IContactRepository;
  }

  let repo: IContactRepository;
  let useCase: ListContactsUseCase;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new ListContactsUseCase(repo);
  });

  it('CL_ADMIN execution forwards a tenant_pinned scope to findAll/count', async () => {
    await useCase.execute({
      actor: { role: 'CL_ADMIN', tenantId: TENANT_A },
      page: 1,
      pageSize: 20,
      sortOrder: 'asc',
    });

    const expectedScope: ContactScope = { kind: 'tenant_pinned', tenantId: TENANT_A };
    expect(repo.findAll).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), expectedScope);
    expect(repo.count).toHaveBeenCalledWith(expect.any(Object), expectedScope);
  });

  it('AM execution without explicit tenantId forwards a global scope (no Agency pin)', async () => {
    await useCase.execute({
      actor: { role: 'AM', tenantId: null },
      page: 1,
      pageSize: 20,
      sortOrder: 'asc',
    });

    const expectedScope: ContactScope = { kind: 'global', explicitTenantId: null };
    expect(repo.findAll).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), expectedScope);
    expect(repo.count).toHaveBeenCalledWith(expect.any(Object), expectedScope);
  });

  it('AM execution with explicit tenantId pins the global scope to the Agency-selector tenant', async () => {
    await useCase.execute({
      actor: { role: 'AM', tenantId: null },
      tenantId: TENANT_B,
      page: 1,
      pageSize: 20,
      sortOrder: 'asc',
    });

    const expectedScope: ContactScope = { kind: 'global', explicitTenantId: TENANT_B };
    expect(repo.findAll).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), expectedScope);
  });

  it('CL aggregations receive scopeTenantId so per-row counts only reflect visible properties', async () => {
    (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([
      // Minimal entity-shape; only `id` matters for the aggregation lookup.
      { id: 'contact-1' },
    ]);

    await useCase.execute({
      actor: { role: 'CL_ADMIN', tenantId: TENANT_A },
      page: 1,
      pageSize: 20,
      sortOrder: 'asc',
    });

    expect(repo.countDistinctPropertiesByContactIds).toHaveBeenCalledWith(['contact-1'], TENANT_A);
    expect(repo.countPrimaryDistinctPropertiesByContactIds).toHaveBeenCalledWith(['contact-1'], TENANT_A);
  });

  it('AM aggregations omit scopeTenantId (no Agency pin) so counts are platform-wide', async () => {
    (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'contact-2' }]);

    await useCase.execute({
      actor: { role: 'AM', tenantId: null },
      page: 1,
      pageSize: 20,
      sortOrder: 'asc',
    });

    expect(repo.countDistinctPropertiesByContactIds).toHaveBeenCalledWith(['contact-2'], undefined);
    expect(repo.countPrimaryDistinctPropertiesByContactIds).toHaveBeenCalledWith(['contact-2'], undefined);
  });
});
