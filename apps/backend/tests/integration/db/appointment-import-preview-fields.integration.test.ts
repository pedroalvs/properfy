/**
 * Real-database round-trip for the appointment-import preview/commit
 * extensions (`branch_id`, `preview_json`, `results_json`) — proves the new
 * columns persist and read back correctly through `PrismaAppointmentImportRepository`,
 * including the PREVIEW status value (still a plain VarChar, no enum needed).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaAppointmentImportRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment-import.repository';
import { AppointmentImportEntity } from '../../../src/modules/appointment/domain/appointment-import.entity';

let harness: DbHarness;
let repo: PrismaAppointmentImportRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaAppointmentImportRepository(harness.prisma);
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

async function seedTenantBranchUser() {
  const suffix = Math.random().toString(36).slice(2, 10);
  const tenant = await harness.prisma.tenant.create({
    data: { name: `T-import-${suffix}`, legal_name: `T-import-${suffix} LLC`, status: 'ACTIVE' },
  });
  const branch = await harness.prisma.branch.create({
    data: { tenant_id: tenant.id, name: 'Main', status: 'ACTIVE' },
  });
  const user = await harness.prisma.user.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, role: 'OP', name: 'Actor',
      email: `import-${suffix}@test.local`, password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  return { tenantId: tenant.id, branchId: branch.id, userId: user.id };
}

describe('AppointmentImport preview/commit field round-trip', () => {
  it('persists and reads back branchId, previewJson, resultsJson, and a PREVIEW status', async () => {
    const { tenantId, branchId, userId } = await seedTenantBranchUser();
    const id = crypto.randomUUID();
    const previewPayload = { summary: { totalRows: 2, importable: 1, withWarnings: 1, withErrors: 0 }, rows: [{ rowNumber: 2 }] };

    await repo.save(new AppointmentImportEntity({
      id, tenantId, branchId, status: 'PREVIEW', fileKey: 'imports/appointments/x/file.xlsx',
      originalFilename: 'file.xlsx', totalRows: 2, successCount: 0, errorCount: 0,
      errorsJson: null, previewJson: previewPayload, resultsJson: null,
      createdByUserId: userId, createdAt: new Date(), updatedAt: new Date(),
    }));

    const found = await repo.findById(id, tenantId);
    expect(found).not.toBeNull();
    expect(found!.branchId).toBe(branchId);
    expect(found!.status).toBe('PREVIEW');
    expect(found!.previewJson).toEqual(previewPayload);
    expect(found!.resultsJson).toBeNull();
  });

  it('updates resultsJson incrementally without disturbing previewJson', async () => {
    const { tenantId, branchId, userId } = await seedTenantBranchUser();
    const id = crypto.randomUUID();
    await repo.save(new AppointmentImportEntity({
      id, tenantId, branchId, status: 'PROCESSING', fileKey: 'imports/appointments/y/file.xlsx',
      originalFilename: 'file.xlsx', totalRows: 1, successCount: 0, errorCount: 0,
      errorsJson: null, previewJson: { summary: {}, rows: [] }, resultsJson: null,
      createdByUserId: userId, createdAt: new Date(), updatedAt: new Date(),
    }));

    await repo.update(id, { resultsJson: [{ rowNumber: 2, status: 'created', appointmentId: 'apt-1' }] });

    const found = await repo.findById(id, tenantId);
    expect(found!.resultsJson).toEqual([{ rowNumber: 2, status: 'created', appointmentId: 'apt-1' }]);
    expect(found!.previewJson).toEqual({ summary: {}, rows: [] });
  });

  it('allows a null branchId (legacy fire-and-forget path)', async () => {
    const { tenantId, userId } = await seedTenantBranchUser();
    const id = crypto.randomUUID();
    await repo.save(new AppointmentImportEntity({
      id, tenantId, branchId: null, status: 'PENDING', fileKey: 'imports/appointments/z/file.xlsx',
      originalFilename: 'file.xlsx', totalRows: 0, successCount: 0, errorCount: 0,
      errorsJson: null, previewJson: null, resultsJson: null,
      createdByUserId: userId, createdAt: new Date(), updatedAt: new Date(),
    }));

    const found = await repo.findById(id, tenantId);
    expect(found!.branchId).toBeNull();
  });
});

describe('findAbandonedPreviews / deleteById (cleanup sweep support)', () => {
  it('finds only PREVIEW-status rows older than the cutoff, and deleteById removes them', async () => {
    const { tenantId, branchId, userId } = await seedTenantBranchUser();
    const oldId = crypto.randomUUID();
    const recentId = crypto.randomUUID();
    const committedId = crypto.randomUUID();

    await repo.save(new AppointmentImportEntity({
      id: oldId, tenantId, branchId, status: 'PREVIEW', fileKey: 'imports/appointments/old/f.csv',
      originalFilename: 'f.csv', totalRows: 0, successCount: 0, errorCount: 0,
      errorsJson: null, previewJson: null, resultsJson: null,
      createdByUserId: userId, createdAt: new Date('2020-01-01'), updatedAt: new Date('2020-01-01'),
    }));
    await repo.save(new AppointmentImportEntity({
      id: recentId, tenantId, branchId, status: 'PREVIEW', fileKey: 'imports/appointments/recent/f.csv',
      originalFilename: 'f.csv', totalRows: 0, successCount: 0, errorCount: 0,
      errorsJson: null, previewJson: null, resultsJson: null,
      createdByUserId: userId, createdAt: new Date(), updatedAt: new Date(),
    }));
    await repo.save(new AppointmentImportEntity({
      id: committedId, tenantId, branchId, status: 'COMPLETED', fileKey: 'imports/appointments/done/f.csv',
      originalFilename: 'f.csv', totalRows: 1, successCount: 1, errorCount: 0,
      errorsJson: null, previewJson: null, resultsJson: null,
      createdByUserId: userId, createdAt: new Date('2020-01-01'), updatedAt: new Date('2020-01-01'),
    }));

    // `save()` never lets a caller dictate created_at (correct for production —
    // it's a Prisma @default(now())); backdate directly for this test's cutoff check.
    await harness.prisma.appointmentImport.updateMany({
      where: { id: { in: [oldId, committedId] } },
      data: { created_at: new Date('2020-01-01') },
    });

    const cutoff = new Date('2024-01-01');
    const abandoned = await repo.findAbandonedPreviews(cutoff);
    const abandonedIds = abandoned.map((a) => a.id);

    expect(abandonedIds).toContain(oldId);
    expect(abandonedIds).not.toContain(recentId); // too recent
    expect(abandonedIds).not.toContain(committedId); // not PREVIEW anymore

    await repo.deleteById(oldId);
    expect(await repo.findById(oldId, tenantId)).toBeNull();
  });
});
