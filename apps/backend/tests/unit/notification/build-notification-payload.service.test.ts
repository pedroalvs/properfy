import { describe, it, expect, beforeEach } from 'vitest';
import {
  BuildNotificationPayloadService,
  MissingRequiredVariableError,
} from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import { MANDATORY_TEMPLATE_CODES, PROPERFY_LOGO_URL } from '@properfy/shared';

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
    // scheduled_date is @db.Date, which Prisma always hands back at UTC midnight.
    scheduledDate: new Date('2026-05-01T00:00:00.000Z'),
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
    portalBaseUrl: 'https://app.properfy.me',
    appointmentCodeFormatter: formatter,
    ...extra,
  };
}

describe('BuildNotificationPayloadService', () => {
  let svc: BuildNotificationPayloadService;

  beforeEach(() => {
    svc = new BuildNotificationPayloadService();
  });

  // ── H1: the scheduled date is a calendar day, not an instant ──────────────
  //
  // These originally guarded against a UTC day-boundary error, on the premise
  // that scheduledDate was a timezone-sensitive instant. It is not:
  // `scheduled_date` is @db.Date, so it denotes a calendar day and Prisma hands
  // it back at UTC midnight. Rendering it therefore involves no timezone at all,
  // which makes the day-boundary class of bug structurally impossible rather
  // than merely handled.

  it('H1: renders the stored calendar day exactly, with no timezone applied', () => {
    const result = svc.build(baseCtx());
    expect(result.scheduledDate).toBe('01/05/2026');
  });

  it('H1: is unaffected by the timezone on the tenant record', () => {
    // Nothing about a calendar day depends on a timezone — this holds for any
    // agency, which is what makes per-agency timezones a non-issue here.
    const tenant = makeTenant({ timezone: 'UTC' });
    const result = svc.build(baseCtx({ tenant }));
    expect(result.scheduledDate).toBe('01/05/2026');
  });

  it('H1: renders the same day for every date in the month, including boundaries', () => {
    for (const [iso, expected] of [
      ['2026-01-01T00:00:00.000Z', '01/01/2026'],
      ['2026-12-31T00:00:00.000Z', '31/12/2026'],
      ['2024-02-29T00:00:00.000Z', '29/02/2024'],
    ] as const) {
      const appointment = makeAppointment({ scheduledDate: new Date(iso) });
      expect(svc.build(baseCtx({ appointment })).scheduledDate).toBe(expected);
    }
  });

  // ── Display format: what the rental tenant actually reads ─────────────────

  it('renders scheduledDate as dd/mm/yyyy, not ISO', () => {
    // Tenants previously received "Your inspection is on 2026-05-01".
    const result = svc.build(baseCtx());
    expect(result.scheduledDate).toBe('01/05/2026');
    expect(result.scheduledDate).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('renders timeSlot as a 12-hour range, not a 24-hour hyphenated pair', () => {
    const result = svc.build(baseCtx());
    expect(result.timeSlot).toBe('9:00 am – 12:00 pm');
    expect(result.timeSlot).not.toBe('09:00-12:00');
  });

  it('renders the time slot in lowercase am/pm without seconds', () => {
    const result = svc.build(baseCtx());
    expect(result.timeSlot).not.toMatch(/AM|PM/);
    expect(result.timeSlot).not.toMatch(/\d:\d{2}:\d{2}/);
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
    const result = svc.build(baseCtx({ rawPortalToken: 'abc123', portalBaseUrl: 'https://app.properfy.me/' }));
    expect(result.confirmationLink).toBe('https://app.properfy.me/portal/abc123');
    expect(result.confirmationLink).not.toContain('//portal');
  });

  // The tenant-facing "propose new date" page was removed, so rescheduleLink no
  // longer has its own path — it points at the portal, like confirmationLink.
  it('H3: rescheduleLink points at the portal, with no /reschedule suffix', () => {
    const result = svc.build(baseCtx({ rawPortalToken: 'abc123', portalBaseUrl: 'https://app.properfy.me' }));
    expect(result.rescheduleLink).toBe('https://app.properfy.me/portal/abc123');
    expect(result.rescheduleLink).not.toContain('/reschedule');
  });

  it('H3: rawToken is URL-encoded in the link', () => {
    const result = svc.build(baseCtx({ rawPortalToken: 'tok+en=special', portalBaseUrl: 'https://app.properfy.me' }));
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

  // ── Properfy logo and service type name ───────────────────────────────────

  it('exposes properfyLogoUrl as the fixed Properfy logo asset', () => {
    const result = svc.build(baseCtx());
    expect(result.properfyLogoUrl).toBe(PROPERFY_LOGO_URL);
    expect(result.properfyLogoUrl).toMatch(/^https:\/\//);
  });

  it('exposes agencyLogoUrl from the tenant settings when a logo was uploaded', () => {
    const tenant = makeTenant({
      settingsJson: { logoUrl: 'https://cdn.example.com/tenant-branding/tenants/t1/branding/logo.png' },
    });
    const result = svc.build(baseCtx({ tenant }));
    expect(result.agencyLogoUrl).toBe(
      'https://cdn.example.com/tenant-branding/tenants/t1/branding/logo.png',
    );
  });

  it('agencyLogoUrl is empty string for a tenant without a logo', () => {
    const result = svc.build(baseCtx());
    expect(result.agencyLogoUrl).toBe('');
  });

  it('agencyLogoUrl ignores a non-string logoUrl setting', () => {
    const tenant = makeTenant({ settingsJson: { logoUrl: 42 } });
    const result = svc.build(baseCtx({ tenant }));
    expect(result.agencyLogoUrl).toBe('');
  });

  it('exposes serviceTypeName from context', () => {
    const result = svc.build(baseCtx({ serviceTypeName: 'Routine inspection' }));
    expect(result.serviceTypeName).toBe('Routine inspection');
  });

  it('serviceTypeName is empty string when not provided', () => {
    const result = svc.build(baseCtx());
    expect(result.serviceTypeName).toBe('');
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

