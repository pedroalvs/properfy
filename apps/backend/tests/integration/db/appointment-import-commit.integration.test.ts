/**
 * End-to-end real-Postgres proof for the appointment-import commit path —
 * exercises the assembled AppointmentImportCommitWorker against REAL
 * repositories (property, contact, service-type, pricing-rule, appointment,
 * branch), not mocks. This is where the review-flagged risks actually get
 * verified:
 *   - intra-batch property dedupe is backed by the real
 *     `properties_normalized_address_active_unique` index, not just an
 *     in-memory map;
 *   - contact reuse hits the real global email/phone index;
 *   - the appointment gets a REAL non-zero pricing snapshot (the legacy
 *     worker this replaces created appointments with price 0);
 *   - custom fields round-trip through the real `custom_fields_json` column.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { AppointmentImportCommitWorker } from '../../../src/modules/appointment/infrastructure/workers/appointment-import-commit.worker';
import { AppointmentImportRowResolver } from '../../../src/modules/appointment/application/services/appointment-import-row-resolver';
import { CreateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/create-appointment.use-case';
import { PrismaAppointmentImportRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment-import.repository';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaPropertyRepository } from '../../../src/modules/property/infrastructure/prisma-property.repository';
import { PrismaBranchRepository } from '../../../src/modules/tenant/infrastructure/prisma-branch.repository';
import { PrismaServiceTypeRepository } from '../../../src/modules/service-type/infrastructure/prisma-service-type.repository';
import { PrismaPricingRuleRepository } from '../../../src/modules/pricing-rule/infrastructure/prisma-pricing-rule.repository';
import { PrismaContactRepository } from '../../../src/modules/contact/infrastructure/prisma-contact.repository';
import { AppointmentImportEntity } from '../../../src/modules/appointment/domain/appointment-import.entity';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuthContext } from '@properfy/shared';
import type { IReportStorageService } from '../../../src/modules/report/domain/report-storage.service';
import type { IJobQueue, JobOptions } from '../../../src/shared/domain/job-queue';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { Logger } from '../../../src/shared/infrastructure/logger';

let harness: DbHarness;

/** In-memory fake — the actual storage provider isn't the surface under
 * test here; only that the worker downloads what preview uploaded. */
class FakeStorageService implements IReportStorageService {
  private readonly files = new Map<string, Buffer>();
  async upload(key: string, buffer: Buffer): Promise<void> { this.files.set(key, buffer); }
  async download(key: string): Promise<Buffer> {
    const buf = this.files.get(key);
    if (!buf) throw new Error(`No such file: ${key}`);
    return buf;
  }
  async generatePresignedGetUrl(): Promise<string> { return 'https://example.test/signed'; }
  async deleteObject(): Promise<void> {}
}

class FakeJobQueue implements IJobQueue {
  enqueued: Array<{ jobName: string; payload: Record<string, unknown> }> = [];
  async enqueue(jobName: string, payload: Record<string, unknown>, _options?: JobOptions): Promise<void> {
    this.enqueued.push({ jobName, payload });
  }
}

const noopLogger: Logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as Logger;

async function seedScenario() {
  const suffix = Math.random().toString(36).slice(2, 10);
  const tenant = await harness.prisma.tenant.create({
    data: { name: `T-commit-${suffix}`, legal_name: `T-commit-${suffix} LLC`, status: 'ACTIVE' },
  });
  const branch = await harness.prisma.branch.create({
    data: { tenant_id: tenant.id, name: 'Main', status: 'ACTIVE' },
  });
  const user = await harness.prisma.user.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, role: 'OP', name: 'Actor',
      email: `commit-${suffix}@test.local`, password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  const serviceType = await harness.prisma.serviceType.create({
    data: {
      code: `RT-${suffix}`, name: `Routine Inspection ${suffix}`, flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true, status: 'ACTIVE',
    },
  });
  await harness.prisma.servicePriceRule.create({
    data: {
      tenant_id: tenant.id, service_type_id: serviceType.id, branch_id: null,
      currency: 'AUD', price_amount: '120.00', payout_type: 'FIXED', payout_value: 90,
      status: 'ACTIVE',
    },
  });
  const existingContact = await harness.prisma.contact.create({
    data: {
      type: 'RENTAL_TENANT', display_name: 'Existing Tenant',
      primary_email: `existing-${suffix}@example.com`, primary_phone: `04${suffix.slice(0, 8).padEnd(8, '1')}`,
      additional_channels_json: [], is_active: true,
    },
  });

  return { tenant, branch, user, serviceType, existingContact };
}

async function seedPreviewImport(tenantId: string, branchId: string, userId: string, storage: FakeStorageService, csv: string) {
  const importId = crypto.randomUUID();
  const fileKey = `imports/appointments/${importId}/file.csv`;
  await storage.upload(fileKey, Buffer.from(csv), 'text/csv');
  const importRepo = new PrismaAppointmentImportRepository(harness.prisma);
  await importRepo.save(new AppointmentImportEntity({
    id: importId, tenantId, branchId, status: 'PREVIEW', fileKey, originalFilename: 'file.csv',
    totalRows: 0, successCount: 0, errorCount: 0, errorsJson: null, previewJson: null, resultsJson: null,
    createdByUserId: userId, createdAt: new Date(), updatedAt: new Date(),
  }));
  return { importId, importRepo };
}

function buildWorker(storage: FakeStorageService, jobQueue: FakeJobQueue) {
  const propertyRepo = new PrismaPropertyRepository(harness.prisma);
  const branchRepo = new PrismaBranchRepository(harness.prisma);
  const serviceTypeRepo = new PrismaServiceTypeRepository(harness.prisma);
  const pricingRuleRepo = new PrismaPricingRuleRepository(harness.prisma);
  const contactRepo = new PrismaContactRepository(harness.prisma);
  const appointmentRepo = new PrismaAppointmentRepository(harness.prisma);
  const importRepo = new PrismaAppointmentImportRepository(harness.prisma);
  const auditService = { log: () => {} } as unknown as AuditService;
  const authorizationService = new AuthorizationService(auditService);

  const resolver = new AppointmentImportRowResolver(propertyRepo, serviceTypeRepo, pricingRuleRepo, contactRepo);
  const createAppointmentUseCase = new CreateAppointmentUseCase(
    appointmentRepo, branchRepo, propertyRepo, serviceTypeRepo, pricingRuleRepo,
    // No CreatePropertyUseCase — the worker always resolves a concrete
    // propertyId itself and never asks CreateAppointmentUseCase to create one inline.
    { execute: async () => { throw new Error('should not be called'); } } as any,
    auditService, authorizationService, undefined, contactRepo,
  );

  const worker = new AppointmentImportCommitWorker(
    importRepo, storage, propertyRepo, resolver, createAppointmentUseCase, jobQueue, auditService, noopLogger,
  );
  return { worker, importRepo, propertyRepo, contactRepo };
}

function actor(tenantId: string, userId: string): AuthContext {
  return { userId, tenantId: null, role: 'OP', branchId: null, inspectorId: null };
}

beforeAll(async () => {
  harness = await setupDbHarness();
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

describe('AppointmentImportCommitWorker — real Postgres end-to-end', () => {
  it('creates exactly one property for two rows sharing a new address, prices the appointment via the real pricing rule, and reuses an existing contact', async () => {
    const { tenant, branch, user, serviceType, existingContact } = await seedScenario();
    const storage = new FakeStorageService();
    const jobQueue = new FakeJobQueue();

    const csv = [
      'Type,Date,Start Time,End Time,Street,Suburb,State,Postcode,Tenant name,Tenant mail,Tenant phone,CUSTOM: Access Instructions',
      `${serviceType.name},2027-06-20,09:00,10:00,9 New Ave,Carlton,NSW,2218,Brand New Tenant,brandnew@example.com,0400111222,Ring buzzer 4`,
      `${serviceType.name},2027-06-21,11:00,12:00,9 New Ave,Carlton,NSW,2218,Second Row Same Address,second@example.com,0400111333,`,
      `${serviceType.name},2027-06-22,13:00,14:00,10 Existing Rd,Rockdale,NSW,2216,Existing Tenant,${existingContact.primary_email},${existingContact.primary_phone},`,
    ].join('\n');

    const { importId, importRepo } = await seedPreviewImport(tenant.id, branch.id, user.id, storage, csv);
    const { worker, propertyRepo, contactRepo } = buildWorker(storage, jobQueue);

    await worker.execute({ importId, actor: actor(tenant.id, user.id) });

    const finalRecord = await importRepo.findById(importId, tenant.id);
    expect(finalRecord!.status).toBe('COMPLETED');
    expect(finalRecord!.successCount).toBe(3);
    expect(finalRecord!.errorCount).toBe(0);

    // Exactly one property for the "9 New Ave" address shared by rows 1-2.
    const newAddrProperty = await propertyRepo.findByNormalizedAddress(tenant.id, {
      street: '9 New Ave', addressLine2: null, suburb: 'Carlton', state: 'NSW', postcode: '2218',
    });
    expect(newAddrProperty).not.toBeNull();
    const allProperties = await harness.prisma.property.findMany({ where: { tenant_id: tenant.id } });
    expect(allProperties).toHaveLength(2); // "9 New Ave" (shared) + "10 Existing Rd"

    // Pricing was actually applied — not the legacy worker's price 0.
    const appointments = await harness.prisma.appointment.findMany({ where: { tenant_id: tenant.id }, orderBy: { scheduled_date: 'asc' } });
    expect(appointments).toHaveLength(3);
    for (const apt of appointments) {
      expect(Number(apt.price_amount)).toBe(120);
      expect(Number(apt.payout_amount)).toBe(90);
    }

    // Custom field round-tripped through the real column.
    const rowWithCustomField = appointments.find((a) => a.scheduled_date.toISOString().startsWith('2027-06-20'));
    expect(rowWithCustomField!.custom_fields_json).toEqual([{ label: 'Access Instructions', value: 'Ring buzzer 4' }]);

    // Existing contact was reused, not duplicated.
    const contactsWithThatEmail = await harness.prisma.contact.findMany({ where: { primary_email: existingContact.primary_email } });
    expect(contactsWithThatEmail).toHaveLength(1);
    const existingRowAppointment = appointments.find((a) => a.scheduled_date.toISOString().startsWith('2027-06-22'))!;
    const junction = await harness.prisma.appointmentContact.findFirst({ where: { appointment_id: existingRowAppointment.id } });
    expect(junction!.contact_id).toBe(existingContact.id);

    // Async geocode enqueued for each newly created property (not a synchronous Mapbox call).
    const geocodeJobs = jobQueue.enqueued.filter((j) => j.jobName === 'property.geocode');
    expect(geocodeJobs).toHaveLength(2);

    void contactRepo; // referenced for type-completeness of destructure
  });
});
