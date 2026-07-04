import { describe, it, expect, beforeEach } from 'vitest';
import {
  BuildNotificationPayloadService,
  MissingRequiredVariableError,
} from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import { MANDATORY_TEMPLATE_CODES } from '@properfy/shared';

const formatter = new AppointmentCodeFormatter();

function makeAppointment(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  return new AppointmentEntity({
    id: 'appt-1',
    appointmentNumber: 42,
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'st-1',
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-04-30T23:00:00.000Z'), // 2026-05-01 09:00 Sydney time
    timeSlotStart: '09:00', timeSlotEnd: '12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 200,
    payoutAmount: 140,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    cancellationReasonCode: null,
    rejectionReasonCode: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeTenant(overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {}) {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    settingsJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeContact(overrides: Partial<ConstructorParameters<typeof AppointmentContactEntity>[0]> = {}) {
  return new AppointmentContactEntity({
    id: 'contact-1',
    appointmentId: 'appt-1',
    contactId: 'registry-1',
    role: 'RENTAL_TENANT',
    isPrimary: true,
    snapshotName: 'John Tenant',
    snapshotEmail: 'john@example.com',
    snapshotPhone: '+61400000001',
    rentalTenantName: 'John Tenant Legacy',
    primaryEmail: 'legacy@example.com',
    primaryPhone: '+61400000000',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function baseCtx(extra: Record<string, unknown> = {}) {
  return {
    templateCode: 'INSPECTION_NOTICE',
    tenant: makeTenant(),
    appointment: makeAppointment(),
    contact: makeContact(),
    propertyAddress: '123 Main St, Sydney NSW 2000',
    rawPortalToken: null,
    portalBaseUrl: 'https://app.properfy.com',
    appointmentCodeFormatter: formatter,
    ...extra,
  };
}

describe('BuildNotificationPayloadService', () => {
  let svc: BuildNotificationPayloadService;

  beforeEach(() => {
    svc = new BuildNotificationPayloadService();
  });

  // ── H1: Timezone-correct date formatting ──────────────────────────────────

  it('H1: formats scheduledDate in tenant timezone, not UTC', () => {
    // scheduledDate = 2026-04-30T23:00:00Z = 2026-05-01 09:00 Australia/Sydney (UTC+10)
    const result = svc.build(baseCtx());
    expect(result.scheduledDate).toBe('2026-05-01');
  });

  it('H1: uses UTC date when timezone is UTC', () => {
    const tenant = makeTenant({ timezone: 'UTC' });
    const appointment = makeAppointment({
      scheduledDate: new Date('2026-04-30T23:00:00.000Z'),
    });
    const result = svc.build(baseCtx({ tenant, appointment }));
    expect(result.scheduledDate).toBe('2026-04-30');
  });

  // ── H2: Required variable enforcement ─────────────────────────────────────

  it('H2: throws MissingRequiredVariableError when required var is absent from allVars', () => {
    // Build payload for INSPECTION_NOTICE — all required vars are produced by allVars,
    // but propertyAddress is required and we pass '' — that still works (empty string ≠ undefined)
    // To trigger the error we need a template whose required vars allVars never sets.
    // We simulate by using a template code whose required includes a var we cannot produce.
    expect(() =>
      svc.build({
        ...baseCtx(),
        templateCode: 'REPORT_READY', // requires 'userName' which allVars never produces
      }),
    ).toThrow(MissingRequiredVariableError);
  });

  it('H2: MissingRequiredVariableError carries templateCode and variableName', () => {
    try {
      svc.build({ ...baseCtx(), templateCode: 'REPORT_READY' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MissingRequiredVariableError);
      expect((err as MissingRequiredVariableError).templateCode).toBe('REPORT_READY');
      expect((err as MissingRequiredVariableError).variableName).toBeDefined();
    }
  });

  it('H2: optional missing vars get empty string (not throw)', () => {
    // INSPECTION_NOTICE: inspectorName is optional and allVars defaults to ''
    const result = svc.build(baseCtx({ inspectorName: null }));
    expect(result.inspectorName).toBe('');
  });

  // ── H3: URL construction ─────────────────────────────────────────────────

  it('H3: confirmationLink is built with URL constructor (handles trailing slash)', () => {
    const result = svc.build(baseCtx({ rawPortalToken: 'abc123', portalBaseUrl: 'https://app.properfy.com/' }));
    expect(result.confirmationLink).toBe('https://app.properfy.com/portal/abc123');
    expect(result.confirmationLink).not.toContain('//portal');
  });

  it('H3: rescheduleLink appends /reschedule path', () => {
    const result = svc.build(baseCtx({ rawPortalToken: 'abc123', portalBaseUrl: 'https://app.properfy.com' }));
    expect(result.rescheduleLink).toBe('https://app.properfy.com/portal/abc123/reschedule');
  });

  it('H3: rawToken is URL-encoded in the link', () => {
    const result = svc.build(baseCtx({ rawPortalToken: 'tok+en=special', portalBaseUrl: 'https://app.properfy.com' }));
    expect(result.confirmationLink).toContain('tok%2Ben%3Dspecial');
  });

  it('H3: confirmationLink and rescheduleLink are empty when no rawPortalToken', () => {
    const result = svc.build(baseCtx({ rawPortalToken: null }));
    expect(result.confirmationLink).toBe('');
    expect(result.rescheduleLink).toBe('');
  });

  // ── Tenant mismatch guard ─────────────────────────────────────────────────

  it('throws when tenant.id does not match appointment.tenantId', () => {
    const tenant = makeTenant({ id: 'wrong-tenant' });
    expect(() => svc.build(baseCtx({ tenant }))).toThrow('Tenant mismatch');
  });

  // ── Unknown template code ─────────────────────────────────────────────────

  it('returns all computed vars when templateCode is unknown', () => {
    const result = svc.build(baseCtx({ templateCode: 'NONEXISTENT_CODE' }));
    expect(result).toHaveProperty('rentalTenantName');
    expect(result).toHaveProperty('scheduledDate');
  });

  // ── appointmentCode via formatter ─────────────────────────────────────────

  it('formats appointmentCode using the tenant prefix column', () => {
    const tenant = makeTenant({ appointmentCodePrefix: 'ABC' });
    const appointment = makeAppointment({ appointmentNumber: 42 });
    const result = svc.build(baseCtx({ tenant, appointment, templateCode: 'INSPECTION_NOTICE' }));
    expect(result.appointmentCode).toBe('ABC-0042');
  });

  // ── All mandatory template codes build without throwing ───────────────────

  // Only appointment-related templates can be built via this service.
  // REPORT_READY / REPORT_FAILED require vars (userName, reportType) that allVars never produces,
  // so they are intentionally excluded from this smoke-test.
  const APPOINTMENT_TEMPLATES = (MANDATORY_TEMPLATE_CODES as readonly string[]).filter(
    (c) => c !== 'REPORT_READY' && c !== 'REPORT_FAILED',
  );

  for (const templateCode of APPOINTMENT_TEMPLATES) {
    it(`builds payload for ${templateCode} without throwing`, () => {
      const ctx = {
        ...baseCtx(),
        templateCode,
        rawPortalToken: 'tok',
        propertyAddress: '123 Main St',
        branchName: 'Main Branch',
        inspectorName: 'Jane Inspector',
      };
      expect(() => svc.build(ctx)).not.toThrow();
    });
  }
});

// ── Standalone MissingRequiredVariableError ───────────────────────────────

describe('MissingRequiredVariableError', () => {
  it('is an instance of Error', () => {
    const err = new MissingRequiredVariableError('TMPL', 'field');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MissingRequiredVariableError');
    expect(err.message).toContain('TMPL');
    expect(err.message).toContain('field');
  });
});

