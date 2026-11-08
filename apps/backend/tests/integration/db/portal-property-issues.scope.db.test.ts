/**
 * Rental-tenant portal issue reporting against a real PostgreSQL database (F10-4).
 *
 * A mocked Prisma cannot prove the cross-token / cross-tenant isolation that is
 * the whole point of this feature: that a token for one appointment can neither
 * read nor create issues for another appointment or agency, that portal issues
 * are created with `source = RENTAL_TENANT_PORTAL` and no user, and that the
 * read-back filters to the token's own portal issues (not staff/inspector ones).
 *
 * Requires Docker (testcontainers). Run via: `pnpm --filter backend test:integration:db`
 */
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROPERTY_FILES_SETTING } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, seedLegacyDoneAppointment, type DbHarness } from './harness';
import { PrismaPropertyFileRepository } from '../../../src/modules/property-file/infrastructure/prisma-property-file.repository';
import { PrismaPropertyIssueRepository } from '../../../src/modules/property-file/infrastructure/prisma-property-issue.repository';
import { PrismaIdempotencyService } from '../../../src/modules/inspector-execution/infrastructure/prisma-idempotency.service';
import { CreatePortalIssueUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/create-portal-issue.use-case';
import { ListPortalIssuesUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/list-portal-issues.use-case';
import { FakeClock } from '../../helpers/fake-clock';

let harness: DbHarness | undefined;
let prisma: PrismaClient;
let createIssue: CreatePortalIssueUseCase;
let listIssues: ListPortalIssuesUseCase;

const clock = new FakeClock(new Date('2026-11-08T00:00:00Z'));
const settings = { get: vi.fn(async () => DEFAULT_PROPERTY_FILES_SETTING as never) };
const audit = { log: vi.fn() };
const suffix = () => Math.random().toString(36).slice(2, 10);

async function insertConfirmedPortalPhoto(
  tenantId: string,
  propertyId: string,
  appointmentId: string,
  overrides: { uploadedByUserId?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await prisma.propertyFile.create({
    data: {
      id,
      tenant_id: tenantId,
      property_id: propertyId,
      appointment_id: appointmentId,
      type: 'ISSUE',
      version_group_id: randomUUID(),
      version: 1,
      file_name: 'leak.jpg',
      mime: 'image/jpeg',
      size_bytes: 100n,
      storage_key: `files/${tenantId}/tenant-issues/${appointmentId}/${id}.jpg`,
      status: 'PENDING',
      confirmed_at: new Date('2026-11-07T00:00:00Z'),
      uploaded_by_user_id: overrides.uploadedByUserId ?? null,
    },
  });
  return id;
}

/** A second appointment reusing the fixture's branch/property/service/user. */
async function createSiblingAppointment(f: {
  tenantId: string;
  branchId: string;
  propertyId: string;
  serviceTypeId: string;
  userId: string;
}): Promise<string> {
  const appt = await prisma.appointment.create({
    data: {
      tenant_id: f.tenantId,
      branch_id: f.branchId,
      property_id: f.propertyId,
      service_type_id: f.serviceTypeId,
      status: 'SCHEDULED',
      scheduled_date: new Date('2026-12-01'),
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: f.userId,
    },
  });
  return appt.id;
}

beforeAll(async () => {
  harness = await setupDbHarness();
  prisma = harness.prisma;
  const fileRepo = new PrismaPropertyFileRepository(prisma);
  const issueRepo = new PrismaPropertyIssueRepository(prisma);
  const idem = new PrismaIdempotencyService(prisma);
  createIssue = new CreatePortalIssueUseCase(
    prisma, issueRepo, fileRepo, settings as never, idem, audit, clock,
  );
  listIssues = new ListPortalIssuesUseCase(issueRepo, fileRepo);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(() => vi.clearAllMocks());

describe('portal issue — creation scope (F10-4)', () => {
  it('creates a RENTAL_TENANT_PORTAL issue scoped to the token appointment, no user', async () => {
    const a = await seedLegacyDoneAppointment(prisma, { tenantName: `PORTAL-A-${suffix()}` });
    const issue = await createIssue.execute({
      appointmentId: a.appointmentId,
      input: { reason: 'The front gate will not lock' },
      idempotencyKey: `k-${suffix()}`,
    });

    const row = await prisma.propertyIssue.findUnique({ where: { id: issue.id } });
    expect(row).not.toBeNull();
    expect(row!.source).toBe('RENTAL_TENANT_PORTAL');
    expect(row!.created_by_user_id).toBeNull();
    expect(row!.tenant_id).toBe(a.tenantId);
    expect(row!.property_id).toBe(a.propertyId);
    expect(row!.appointment_id).toBe(a.appointmentId);
  });

  it('atomically links a confirmed portal photo and flips it READY (D20)', async () => {
    const a = await seedLegacyDoneAppointment(prisma, { tenantName: `PORTAL-LINK-${suffix()}` });
    const photoId = await insertConfirmedPortalPhoto(a.tenantId, a.propertyId, a.appointmentId);

    const issue = await createIssue.execute({
      appointmentId: a.appointmentId,
      input: { reason: 'leak', photoFileIds: [photoId] },
      idempotencyKey: `k-${suffix()}`,
    });
    expect(issue.photos).toHaveLength(1);

    const photo = await prisma.propertyFile.findUnique({ where: { id: photoId } });
    expect(photo!.status).toBe('READY');
    expect(photo!.issue_id).toBe(issue.id);
  });

  it('refuses to link a photo from a DIFFERENT appointment on the same property+tenant (409, rollback)', async () => {
    const f = await seedLegacyDoneAppointment(prisma, { tenantName: `XAPPT-${suffix()}` });
    const otherAppointmentId = await createSiblingAppointment(f);
    // A confirmed portal photo belonging to the OTHER appointment (same property+tenant).
    const foreignPhoto = await insertConfirmedPortalPhoto(f.tenantId, f.propertyId, otherAppointmentId);

    await expect(
      createIssue.execute({
        appointmentId: f.appointmentId,
        input: { reason: 'try to steal', photoFileIds: [foreignPhoto] },
        idempotencyKey: `k-${suffix()}`,
      }),
    ).rejects.toMatchObject({ code: 'PROPERTY_ISSUE_PHOTO_LINK_FAILED' });

    // Rolled back: no issue created, the foreign photo untouched (still PENDING, other appt).
    const issues = await prisma.propertyIssue.findMany({ where: { appointment_id: f.appointmentId } });
    expect(issues).toHaveLength(0);
    const row = await prisma.propertyFile.findUnique({ where: { id: foreignPhoto } });
    expect(row!.status).toBe('PENDING');
    expect(row!.issue_id).toBeNull();
    expect(row!.appointment_id).toBe(otherAppointmentId);
  });

  it('refuses to link a STAFF-uploaded photo (uploaded_by_user_id set) on the token appointment', async () => {
    const f = await seedLegacyDoneAppointment(prisma, { tenantName: `XSTAFF-${suffix()}` });
    const staffPhoto = await insertConfirmedPortalPhoto(f.tenantId, f.propertyId, f.appointmentId, {
      uploadedByUserId: f.userId,
    });

    await expect(
      createIssue.execute({
        appointmentId: f.appointmentId,
        input: { reason: 'steal staff photo', photoFileIds: [staffPhoto] },
        idempotencyKey: `k-${suffix()}`,
      }),
    ).rejects.toMatchObject({ code: 'PROPERTY_ISSUE_PHOTO_LINK_FAILED' });
    const row = await prisma.propertyFile.findUnique({ where: { id: staffPhoto } });
    expect(row!.status).toBe('PENDING');
    expect(row!.issue_id).toBeNull();
  });
});

describe('portal issue — cross-token / cross-tenant isolation (C.A2)', () => {
  it('a token for appointment A cannot see appointment B, and only RENTAL_TENANT_PORTAL issues of its own appointment', async () => {
    const a = await seedLegacyDoneAppointment(prisma, { tenantName: `ISO-A-${suffix()}` });
    const b = await seedLegacyDoneAppointment(prisma, { tenantName: `ISO-B-${suffix()}` });

    // Appointment A: one tenant-portal issue + one STAFF issue (direct insert).
    const portalIssue = await createIssue.execute({
      appointmentId: a.appointmentId,
      input: { reason: 'A tenant report' },
      idempotencyKey: `k-${suffix()}`,
    });
    await prisma.propertyIssue.create({
      data: {
        tenant_id: a.tenantId,
        property_id: a.propertyId,
        appointment_id: a.appointmentId,
        reason: 'A staff report',
        source: 'STAFF',
      },
    });

    // Appointment B: a tenant-portal issue the A-token must never see.
    await createIssue.execute({
      appointmentId: b.appointmentId,
      input: { reason: 'B tenant report' },
      idempotencyKey: `k-${suffix()}`,
    });

    const aList = await listIssues.execute({ appointmentId: a.appointmentId });
    expect(aList.issues).toHaveLength(1);
    expect(aList.issues[0]!.id).toBe(portalIssue.id);
    expect(aList.issues[0]!.reason).toBe('A tenant report');

    const bList = await listIssues.execute({ appointmentId: b.appointmentId });
    expect(bList.issues).toHaveLength(1);
    expect(bList.issues[0]!.reason).toBe('B tenant report');
    // B's token never surfaces A's issue.
    expect(bList.issues.some((i) => i.id === portalIssue.id)).toBe(false);
  });
});
