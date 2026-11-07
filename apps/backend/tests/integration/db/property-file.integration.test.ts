/**
 * Property files & issues against a real PostgreSQL database (F10-1).
 *
 * A mocked Prisma cannot prove the D20 all-or-nothing photo link (the actual
 * UPDATE … WHERE confirmed_at IS NOT NULL), the mark-as-seen CAS, cross-tenant
 * isolation, the `withIssues` relation filter, the unseen-count DISTINCT query,
 * or the retention sweep. These need a real DB.
 *
 * Requires Docker (testcontainers). Run via: `pnpm --filter backend test:integration:db`
 */
import type { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext, UserRole } from '@properfy/shared';
import { DEFAULT_PROPERTY_FILES_SETTING } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaPropertyFileRepository } from '../../../src/modules/property-file/infrastructure/prisma-property-file.repository';
import { PrismaPropertyIssueRepository } from '../../../src/modules/property-file/infrastructure/prisma-property-issue.repository';
import { PropertyScopeService } from '../../../src/modules/property-file/application/property-scope.service';
import { CreatePropertyIssueUseCase } from '../../../src/modules/property-file/application/use-cases/create-property-issue.use-case';
import { MarkPropertyIssueAsSeenUseCase } from '../../../src/modules/property-file/application/use-cases/mark-property-issue-seen.use-case';
import { ListPropertyIssuesUseCase } from '../../../src/modules/property-file/application/use-cases/list-property-issues.use-case';
import { CountUnseenPropertyIssuesUseCase } from '../../../src/modules/property-file/application/use-cases/count-unseen-property-issues.use-case';
import { PropertyFileRetentionWorker } from '../../../src/modules/property-file/infrastructure/workers/property-file-retention.worker';
import { PrismaIdempotencyService } from '../../../src/modules/inspector-execution/infrastructure/prisma-idempotency.service';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { FakeClock } from '../../helpers/fake-clock';
import { randomUUID } from 'node:crypto';

let harness: DbHarness | undefined;
let prisma: PrismaClient;

let fileRepo: PrismaPropertyFileRepository;
let issueRepo: PrismaPropertyIssueRepository;
let createIssue: CreatePropertyIssueUseCase;
let markSeen: MarkPropertyIssueAsSeenUseCase;
let listIssues: ListPropertyIssuesUseCase;
let unseenCount: CountUnseenPropertyIssuesUseCase;

const suffix = () => Math.random().toString(36).slice(2, 10);
const clock = new FakeClock(new Date('2026-11-08T00:00:00Z'));
const settings = { get: vi.fn(async () => DEFAULT_PROPERTY_FILES_SETTING as never) };
const visibility = { resolveForInspector: vi.fn(async () => null) };

function actor(role: UserRole, tenantId: string | null): AuthContext {
  return { userId: randomUUID(), tenantId, role, branchId: null, inspectorId: null };
}

async function createTenantWithProperty(name: string): Promise<{ tenantId: string; propertyId: string }> {
  const tenant = await prisma.tenant.create({
    data: { name, legal_name: `${name} ${suffix()}`, status: 'ACTIVE' },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id, property_code: `PF-${suffix()}`, type: 'HOUSE',
      street: '1 Test St', suburb: 'Testville', postcode: '2000', state: 'NSW',
      country: 'AU', geocoding_status: 'PENDING',
    },
  });
  return { tenantId: tenant.id, propertyId: property.id };
}

async function insertConfirmedIssuePhoto(tenantId: string, propertyId: string): Promise<string> {
  const id = randomUUID();
  await prisma.propertyFile.create({
    data: {
      id, tenant_id: tenantId, property_id: propertyId, type: 'ISSUE',
      version_group_id: randomUUID(), version: 1, file_name: 'p.jpg', mime: 'image/jpeg',
      size_bytes: 100n, storage_key: `files/${tenantId}/${propertyId}/${id}.jpg`,
      status: 'PENDING', confirmed_at: new Date('2026-11-07T00:00:00Z'),
    },
  });
  return id;
}

beforeAll(async () => {
  harness = await setupDbHarness();
  prisma = harness.prisma;
  const audit = { log: vi.fn() };
  const auth = new AuthorizationService(audit);
  const idem = new PrismaIdempotencyService(prisma);
  fileRepo = new PrismaPropertyFileRepository(prisma);
  issueRepo = new PrismaPropertyIssueRepository(prisma);
  const scope = new PropertyScopeService(visibility as never);
  createIssue = new CreatePropertyIssueUseCase(prisma, issueRepo, fileRepo, visibility as never, settings as never, idem, audit, auth, clock);
  markSeen = new MarkPropertyIssueAsSeenUseCase(issueRepo, scope, audit, auth, clock);
  listIssues = new ListPropertyIssuesUseCase(issueRepo, fileRepo, scope);
  unseenCount = new CountUnseenPropertyIssuesUseCase(issueRepo, auth);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(() => vi.clearAllMocks());

describe('CreatePropertyIssue — D20 atomic photo link', () => {
  it('links every confirmed PENDING photo and flips it to READY', async () => {
    const a = await createTenantWithProperty('D20A');
    const p1 = await insertConfirmedIssuePhoto(a.tenantId, a.propertyId);
    const p2 = await insertConfirmedIssuePhoto(a.tenantId, a.propertyId);
    const issue = await createIssue.execute({
      actor: actor('OP', null),
      input: { propertyId: a.propertyId, reason: 'Broken window', photoFileIds: [p1, p2] },
      idempotencyKey: `k-${suffix()}`,
    });
    expect(issue.photos).toHaveLength(2);
    const rows = await prisma.propertyFile.findMany({ where: { id: { in: [p1, p2] } } });
    expect(rows.every((r) => r.status === 'READY' && r.issue_id === issue.id)).toBe(true);
  });

  it('409s and rolls back when a referenced photo is not confirmed', async () => {
    const a = await createTenantWithProperty('D20B');
    const confirmed = await insertConfirmedIssuePhoto(a.tenantId, a.propertyId);
    // An unconfirmed (never passed confirm) PENDING photo must not link (C.A5).
    const unconfirmedId = randomUUID();
    await prisma.propertyFile.create({
      data: {
        id: unconfirmedId, tenant_id: a.tenantId, property_id: a.propertyId, type: 'ISSUE',
        version_group_id: randomUUID(), version: 1, file_name: 'u.jpg', mime: 'image/jpeg',
        size_bytes: 10n, storage_key: `files/${a.tenantId}/${a.propertyId}/${unconfirmedId}.jpg`,
        status: 'PENDING', confirmed_at: null,
      },
    });
    await expect(
      createIssue.execute({
        actor: actor('OP', null),
        input: { propertyId: a.propertyId, reason: 'x', photoFileIds: [confirmed, unconfirmedId] },
        idempotencyKey: `k-${suffix()}`,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    // No issue persisted; the confirmed photo stays PENDING (rollback).
    expect(await prisma.propertyIssue.count({ where: { property_id: a.propertyId } })).toBe(0);
    const stillPending = await prisma.propertyFile.findUnique({ where: { id: confirmed } });
    expect(stillPending?.status).toBe('PENDING');
    expect(stillPending?.issue_id).toBeNull();
  });
});

describe('MarkPropertyIssueAsSeen — CAS', () => {
  it('first call marks seen, a second returns alreadySeen', async () => {
    const a = await createTenantWithProperty('CAS');
    const issue = await createIssue.execute({
      actor: actor('OP', null),
      input: { propertyId: a.propertyId, reason: 'seen me' },
      idempotencyKey: `k-${suffix()}`,
    });
    const first = await markSeen.execute({ actor: actor('OP', null), issueId: issue.id });
    expect(first).toMatchObject({ alreadySeen: false, seen: true });
    const second = await markSeen.execute({ actor: actor('OP', null), issueId: issue.id });
    expect(second.alreadySeen).toBe(true);
  });
});

describe('Cross-tenant isolation (C.A2) & indicators', () => {
  it('a CL of another tenant cannot mark-seen a foreign issue (404)', async () => {
    const a = await createTenantWithProperty('ISOA');
    const b = await createTenantWithProperty('ISOB');
    const issue = await createIssue.execute({
      actor: actor('OP', null), input: { propertyId: a.propertyId, reason: 'secret' }, idempotencyKey: `k-${suffix()}`,
    });
    await expect(
      markSeen.execute({ actor: actor('CL_ADMIN', b.tenantId), issueId: issue.id }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('unseen-count is tenant-scoped for CL_ADMIN and cross-tenant for AM', async () => {
    const a = await createTenantWithProperty('CNT');
    await createIssue.execute({ actor: actor('OP', null), input: { propertyId: a.propertyId, reason: 'open' }, idempotencyKey: `k-${suffix()}` });
    const cl = await unseenCount.execute({ actor: actor('CL_ADMIN', a.tenantId) });
    expect(cl.propertiesWithUnseenIssues).toBeGreaterThanOrEqual(1);
    const am = await unseenCount.execute({ actor: actor('AM', null) });
    expect(am.propertiesWithUnseenIssues).toBeGreaterThanOrEqual(cl.propertiesWithUnseenIssues);
  });

  it('list is tenant-confined: a CL of B sees no issues of A', async () => {
    const a = await createTenantWithProperty('LSTA');
    await createIssue.execute({ actor: actor('OP', null), input: { propertyId: a.propertyId, reason: 'mine' }, idempotencyKey: `k-${suffix()}` });
    const asB = await listIssues.execute({ actor: actor('CL_ADMIN', randomUUID()), query: { propertyId: a.propertyId } });
    expect(asB.issues).toHaveLength(0);
    const asOp = await listIssues.execute({ actor: actor('OP', null), query: { propertyId: a.propertyId } });
    expect(asOp.issues.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Retention worker', () => {
  it('purges a soft-deleted READY file: deleteObject called, purged_at set, audited', async () => {
    const a = await createTenantWithProperty('RET');
    const id = randomUUID();
    await prisma.propertyFile.create({
      data: {
        id, tenant_id: a.tenantId, property_id: a.propertyId, type: 'DOCUMENT',
        version_group_id: randomUUID(), version: 1, file_name: 'old.pdf', mime: 'application/pdf',
        size_bytes: 10n, storage_key: `files/${a.tenantId}/${a.propertyId}/${id}.pdf`,
        status: 'READY', confirmed_at: new Date('2020-01-01T00:00:00Z'),
        // deleted long before the 365-day window
        deleted_at: new Date('2024-01-01T00:00:00Z'),
      },
    });
    const deleteObject = vi.fn(async () => undefined);
    const audit = { log: vi.fn() };
    const worker = new PropertyFileRetentionWorker(
      fileRepo, { deleteObject } as never, settings as never, audit, { info: vi.fn(), error: vi.fn() } as never, clock,
    );
    const result = await worker.execute();
    expect(result.deletedPurged).toBeGreaterThanOrEqual(1);
    expect(deleteObject).toHaveBeenCalled();
    const purged = await prisma.propertyFile.findUnique({ where: { id } });
    expect(purged?.purged_at).not.toBeNull();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'property_file.purged' }));
  });
});
