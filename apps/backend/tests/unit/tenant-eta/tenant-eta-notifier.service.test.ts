import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  TenantEtaNotifier,
  type TenantEtaNotifyInput,
} from '../../../src/modules/tenant-eta/application/tenant-eta-notifier.service';
import { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { BuildNotificationPayloadService } from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import { NotificationEntity } from '../../../src/modules/notification/domain/notification.entity';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { getTenantEtaNotificationId } from '../../../src/modules/tenant-eta/domain/tenant-eta-notification-id';

// ── Fixture (ag-syd, Sydney AEDT = UTC+11, 2026-11-05) ─────────────────────
const TENANT_ID = 'ag-syd';
const APPT_B = 'appt-B';
const SCHEDULED_DATE = '2026-11-05';
const NOW_0700 = new Date('2026-11-04T20:00:00.000Z'); // 07:00 Sydney
const B_WINDOW_START = new Date('2026-11-04T22:00:00.000Z'); // 09:00 Sydney
const B_WINDOW_END = new Date('2026-11-05T01:00:00.000Z'); // 12:00 Sydney
const B_START = new Date('2026-11-04T22:00:00.000Z'); // projected 09:00
const BAND = { from: new Date('2026-11-04T22:00:00.000Z'), to: new Date('2026-11-04T22:30:00.000Z') };

type StoredRepo = {
  store: Map<string, NotificationEntity>;
  saveIfAbsent: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  countByTenantChannelSince: ReturnType<typeof vi.fn>;
};

function makeRepo(): StoredRepo {
  const store = new Map<string, NotificationEntity>();
  return {
    store,
    saveIfAbsent: vi.fn(async (n: NotificationEntity) => {
      if (store.has(n.id)) return false;
      store.set(n.id, n);
      return true;
    }),
    save: vi.fn(async (n: NotificationEntity) => {
      store.set(n.id, n);
    }),
    count: vi.fn(async (f: Record<string, unknown>) => {
      let c = 0;
      for (const n of store.values()) {
        if (f['tenantId'] !== undefined && n.tenantId !== f['tenantId']) continue;
        if (f['appointmentId'] !== undefined && n.appointmentId !== f['appointmentId']) continue;
        if (f['channel'] !== undefined && n.channel !== f['channel']) continue;
        if (f['status'] !== undefined && n.status !== f['status']) continue;
        if (f['templateCode'] !== undefined && n.templateCode !== f['templateCode']) continue;
        if (f['fromDate'] !== undefined && n.createdAt < new Date(f['fromDate'] as string)) continue;
        if (f['toDate'] !== undefined && n.createdAt > new Date(f['toDate'] as string)) continue;
        c += 1;
      }
      return c;
    }),
    countByTenantChannelSince: vi.fn(async (tenantId: string | null, channel: string, since: Date) => {
      let c = 0;
      for (const n of store.values()) {
        if (n.tenantId !== tenantId) continue;
        if (n.channel !== channel) continue;
        if (n.createdAt < since) continue;
        if (n.status === 'SKIPPED' || n.status === 'SKIPPED_OPT_OUT') continue;
        c += 1;
      }
      return c;
    }),
  };
}

function makeNotification(overrides: Partial<ConstructorParameters<typeof NotificationEntity>[0]>): NotificationEntity {
  const now = new Date();
  return new NotificationEntity({
    id: randomUUID(), tenantId: TENANT_ID, appointmentId: null, recipient: 'r@x.local',
    channel: 'SMS', templateCode: 'OTHER', status: 'SENT', notificationClass: null,
    providerName: null, providerMessageId: null, sentAt: null, deliveredAt: null,
    failedAt: null, failureReason: null, payloadJson: {}, retryCount: 0, nextRetryAt: null,
    createdAt: now, updatedAt: now, ...overrides,
  });
}

function makeAppointment(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  return new AppointmentEntity({
    id: APPT_B, appointmentNumber: 42, tenantId: TENANT_ID, branchId: 'branch-1', propertyId: 'prop-1',
    serviceTypeId: 'st-1', inspectorId: 'insp-1', status: 'SCHEDULED',
    scheduledDate: new Date('2026-11-05T00:00:00.000Z'), timeSlotStart: '09:00', timeSlotEnd: '12:00',
    keyRequired: false, meetingLocation: null, keyLocation: null, rentalTenantConfirmationStatus: 'CONFIRMED',
    priceAmount: 100, payoutAmount: 80, pricingRuleSnapshotJson: {}, notes: null, customFieldsJson: null,
    reason: null, cancellationReasonCode: null, rejectionReasonCode: null, createdByUserId: 'user-1',
    doneMarkedByUserId: null, doneCheckedByUserId: null, doneCheckedAt: null, serviceGroupId: null,
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...overrides,
  });
}

function makeTenant(settingsJson: Record<string, unknown> = {}) {
  return new TenantEntity({
    id: TENANT_ID, name: 'Syd', legalName: 'Syd LLC', status: 'ACTIVE', timezone: 'Australia/Sydney',
    currency: 'AUD', settingsJson, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  });
}

function makeContact(email: string | null, phone: string | null) {
  return new AppointmentContactEntity({
    id: 'contact-1', appointmentId: APPT_B, contactId: 'reg-1', role: 'RENTAL_TENANT', isPrimary: true,
    snapshotName: 'Ben Tenant', snapshotEmail: email, snapshotPhone: phone,
    createdAt: new Date(), updatedAt: new Date(),
  });
}

function makePlanStop(overrides: Record<string, unknown> = {}) {
  return {
    appointmentId: APPT_B, sequence: 2, tenantId: TENANT_ID, scheduledDate: SCHEDULED_DATE,
    appointmentStatus: 'SCHEDULED', travelS: 900, durationMinutes: 60,
    windowStartAt: B_WINDOW_START, windowEndAt: B_WINDOW_END, windowTimezone: 'Australia/Sydney',
    missingCoordinates: false, serviceStartAt: B_START, serviceEndAt: null, publishedServiceStartAt: B_START,
    ...overrides,
  } as TenantEtaNotifyInput['planStop'];
}

function makeProjected(overrides: Record<string, unknown> = {}) {
  return {
    appointmentId: APPT_B, state: 'PENDING', windowStartAt: B_WINDOW_START, windowEndAt: B_WINDOW_END,
    windowTimezone: 'Australia/Sydney', projectedArrivalAt: B_START, projectedStartAt: B_START,
    projectedEndAt: null, lateS: 0, floorApplied: false, ...overrides,
  } as TenantEtaNotifyInput['projected'];
}

const DEFAULT_SETTINGS = {
  enabled: true, channelMode: 'BOTH', morningHour: 7, morningCutoffHour: 9,
  delayThresholdMinutes: 20, smsBudgetSharePercent: 80,
} as const;

function makeInput(overrides: Partial<TenantEtaNotifyInput> = {}): TenantEtaNotifyInput {
  const contact = overrides.appointmentWithRelations
    ? overrides.appointmentWithRelations.contact
    : makeContact('ben@example.com', '+61412000002');
  const awr = overrides.appointmentWithRelations ?? ({
    appointment: makeAppointment(), contact, contacts: contact ? [contact] : [], restrictions: [],
    propertyAddress: '1 B St, Surry Hills NSW 2010', branchName: 'BS', serviceTypeName: 'Routine',
    serviceTypeFlowType: 'ROUTINE', inspectorName: 'Insp', hasActivePortalToken: false,
  } as unknown as TenantEtaNotifyInput['appointmentWithRelations']);
  return {
    kind: 'MORNING', trigger: 'MORNING', planStop: makePlanStop(), projected: makeProjected(),
    stopMeta: { rentalTenantConfirmationStatus: 'CONFIRMED', keyRequired: false, requiresRentalTenantConfirmation: true },
    band: BAND, appointmentWithRelations: awr, tenant: makeTenant(), settings: { ...DEFAULT_SETTINGS },
    planVersion: 3, approximate: false, now: NOW_0700, ...overrides,
  };
}

describe('TenantEtaNotifier', () => {
  let repo: StoredRepo;
  let createNotification: CreateNotificationUseCase;
  let metrics: { incrementTenantEtaNoticeCount: ReturnType<typeof vi.fn> };
  let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
  let notifier: TenantEtaNotifier;

  beforeEach(() => {
    repo = makeRepo();
    const templateRepo = { findByTenantCodeChannel: vi.fn().mockResolvedValue(null), findAll: vi.fn(), upsert: vi.fn() };
    const jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    createNotification = new CreateNotificationUseCase(repo as never, templateRepo as never, jobQueue as never);
    metrics = { incrementTenantEtaNoticeCount: vi.fn() };
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    notifier = new TenantEtaNotifier(
      createNotification, repo as never, new BuildNotificationPayloadService(),
      new AppointmentCodeFormatter(), 'https://app.properfy.me', metrics, logger as never,
    );
  });

  const storedRows = () => [...repo.store.values()];

  // 1
  it('creates one EMAIL and one SMS row with the deterministic id and band variables', async () => {
    const result = await notifier.notify(makeInput());
    expect(result).toEqual({ created: 2, duplicates: 0 });
    const rows = storedRows();
    expect(rows).toHaveLength(2);
    const email = rows.find((r) => r.channel === 'EMAIL')!;
    const sms = rows.find((r) => r.channel === 'SMS')!;
    expect(email.recipient).toBe('ben@example.com');
    expect(sms.recipient).toBe('+61412000002');
    expect(email.templateCode).toBe('TENANT_ETA_MORNING');
    expect(email.id).toBe(getTenantEtaNotificationId({ kind: 'MORNING', appointmentId: APPT_B, scheduledDate: SCHEDULED_DATE, channel: 'EMAIL' }));
    expect(sms.id).toBe(getTenantEtaNotificationId({ kind: 'MORNING', appointmentId: APPT_B, scheduledDate: SCHEDULED_DATE, channel: 'SMS' }));
    expect(email.payloadJson['etaFrom']).toBe('9:00 am');
    expect(email.payloadJson['etaTo']).toBe('9:30 am');
    expect(metrics.incrementTenantEtaNoticeCount).toHaveBeenCalledWith('MORNING', 'EMAIL');
    expect(metrics.incrementTenantEtaNoticeCount).toHaveBeenCalledWith('MORNING', 'SMS');
  });

  // 2
  it('sends only SMS when the contact has only a phone, only EMAIL when only an email, nothing when neither', async () => {
    const onlyPhone = await notifier.notify(makeInput({ appointmentWithRelations: awrWith(makeContact(null, '+61412000003')) }));
    expect(onlyPhone).toEqual({ created: 1, duplicates: 0 });
    expect(storedRows()[0]!.channel).toBe('SMS');

    repo = makeRepo();
    rebuild();
    const onlyEmail = await notifier.notify(makeInput({ appointmentWithRelations: awrWith(makeContact('eve@example.com', null)) }));
    expect(onlyEmail).toEqual({ created: 1, duplicates: 0 });
    expect(storedRows()[0]!.channel).toBe('EMAIL');

    repo = makeRepo();
    rebuild();
    const none = await notifier.notify(makeInput({ appointmentWithRelations: awrWith(makeContact(null, null)) }));
    expect(none.skippedReason).toBe('NO_RECIPIENT');
    expect(storedRows()).toHaveLength(0);
  });

  // 3
  it('SMS_ELSE_EMAIL prefers SMS when a phone exists, else EMAIL', async () => {
    const both = await notifier.notify(makeInput({ settings: { ...DEFAULT_SETTINGS, channelMode: 'SMS_ELSE_EMAIL' } }));
    expect(both).toEqual({ created: 1, duplicates: 0 });
    expect(storedRows()[0]!.channel).toBe('SMS');

    repo = makeRepo();
    rebuild();
    const emailOnly = await notifier.notify(makeInput({
      settings: { ...DEFAULT_SETTINGS, channelMode: 'SMS_ELSE_EMAIL' },
      appointmentWithRelations: awrWith(makeContact('eve@example.com', null)),
    }));
    expect(emailOnly).toEqual({ created: 1, duplicates: 0 });
    expect(storedRows()[0]!.channel).toBe('EMAIL');
  });

  // 4
  it('skips with DISABLED when the setting is off', async () => {
    const r = await notifier.notify(makeInput({ settings: { ...DEFAULT_SETTINGS, enabled: false } }));
    expect(r.skippedReason).toBe('DISABLED');
    expect(storedRows()).toHaveLength(0);
  });

  // 5
  it('skips with AGENCY_SWITCH_OFF when rental-tenant notifications are off', async () => {
    const r = await notifier.notify(makeInput({ tenant: makeTenant({ rentalTenantNotificationsEnabled: false }) }));
    expect(r.skippedReason).toBe('AGENCY_SWITCH_OFF');
    expect(storedRows()).toHaveLength(0);
  });

  // 5b
  it('skips with AGENCY_ETA_OFF before the rental switch when the agency ETA flag is off', async () => {
    const r = await notifier.notify(makeInput({ tenant: makeTenant({ tenantEtaNoticesEnabled: false }) }));
    expect(r.skippedReason).toBe('AGENCY_ETA_OFF');

    const bothOff = await notifier.notify(makeInput({ tenant: makeTenant({ tenantEtaNoticesEnabled: false, rentalTenantNotificationsEnabled: false }) }));
    expect(bothOff.skippedReason).toBe('AGENCY_ETA_OFF');

    const absent = await notifier.notify(makeInput({ tenant: makeTenant({}) }));
    expect(absent.created).toBe(2);
  });

  // 5c
  it('applies the tenant-confirmation guard (L-F06-02)', async () => {
    const meta = (o: Partial<TenantEtaNotifyInput['stopMeta']>) => ({ rentalTenantConfirmationStatus: 'CONFIRMED', keyRequired: false, requiresRentalTenantConfirmation: true, ...o }) as TenantEtaNotifyInput['stopMeta'];
    expect((await notifier.notify(makeInput({ stopMeta: meta({ rentalTenantConfirmationStatus: 'UNAVAILABLE', keyRequired: true }) }))).skippedReason).toBe('TENANT_UNAVAILABLE');
    rebuild();
    expect((await notifier.notify(makeInput({ stopMeta: meta({ rentalTenantConfirmationStatus: 'PENDING', keyRequired: true }) }))).skippedReason).toBe('TENANT_UNCONFIRMED');
    rebuild();
    expect((await notifier.notify(makeInput({ stopMeta: meta({ rentalTenantConfirmationStatus: 'NO_RESPONSE', keyRequired: true }) }))).skippedReason).toBe('TENANT_UNCONFIRMED');
    rebuild();
    expect((await notifier.notify(makeInput({ stopMeta: meta({ rentalTenantConfirmationStatus: 'PENDING', keyRequired: true, requiresRentalTenantConfirmation: false }) }))).created).toBe(2);
    rebuild();
    expect((await notifier.notify(makeInput({ stopMeta: meta({ rentalTenantConfirmationStatus: 'PENDING', keyRequired: false }) }))).created).toBe(2);
    rebuild();
    expect((await notifier.notify(makeInput({ stopMeta: meta({ rentalTenantConfirmationStatus: 'CONFIRMED', keyRequired: true }) }))).created).toBe(2);
  });

  // 6
  it('skips non-notifying flow types (Ingoing/Outgoing), sends for unknown (fail-open)', async () => {
    for (const flow of ['INGOING', 'OUTGOING']) {
      rebuild();
      const r = await notifier.notify(makeInput({ appointmentWithRelations: awrWith(makeContact('ben@example.com', '+61412000002'), flow) }));
      expect(r.skippedReason).toBe('FLOW_TYPE_NO_OCCUPANT');
    }
    rebuild();
    const unknown = await notifier.notify(makeInput({ appointmentWithRelations: awrWith(makeContact('ben@example.com', '+61412000002'), 'SOMETHING_NEW') }));
    expect(unknown.created).toBe(2);
  });

  // 7
  it('skips with BEFORE_MORNING_HOUR before the morning hour (D13)', async () => {
    const r = await notifier.notify(makeInput({ now: new Date('2026-11-04T19:59:00.000Z') })); // 06:59 Sydney
    expect(r.skippedReason).toBe('BEFORE_MORNING_HOUR');
  });

  // NEXT_TOO_FAR (L-F06-01) — notifier guard, only for ON_THE_WAY
  it('skips ON_THE_WAY beyond the 60-minute lead but sends at exactly 60 min; never gates DELAY', async () => {
    const far = new Date(NOW_0700.getTime() + 61 * 60_000);
    const r = await notifier.notify(makeInput({ kind: 'ON_THE_WAY', trigger: 'FINISH', projected: makeProjected({ projectedArrivalAt: far, projectedStartAt: far }) }));
    expect(r.skippedReason).toBe('NEXT_TOO_FAR');
    rebuild();
    const exact = new Date(NOW_0700.getTime() + 60 * 60_000);
    const ok = await notifier.notify(makeInput({ kind: 'ON_THE_WAY', trigger: 'FINISH', band: BAND, projected: makeProjected({ projectedArrivalAt: exact, projectedStartAt: exact }) }));
    expect(ok.created).toBe(2);
    rebuild();
    const delay = await notifier.notify(makeInput({ kind: 'DELAY', trigger: 'SWEEP', projected: makeProjected({ projectedArrivalAt: far, projectedStartAt: far, lateS: 1500 }) }));
    expect(delay.created).toBe(2);
  });

  // 8
  it('is idempotent: the second identical call creates nothing and does not meter', async () => {
    const first = await notifier.notify(makeInput());
    expect(first).toEqual({ created: 2, duplicates: 0 });
    metrics.incrementTenantEtaNoticeCount.mockClear();
    const second = await notifier.notify(makeInput());
    expect(second).toEqual({ created: 0, duplicates: 2 });
    expect(metrics.incrementTenantEtaNoticeCount).not.toHaveBeenCalled();
    expect(storedRows()).toHaveLength(2);
  });

  // 8b
  it('reports created:1, duplicates:1 when only one channel already exists', async () => {
    const existingId = getTenantEtaNotificationId({ kind: 'MORNING', appointmentId: APPT_B, scheduledDate: SCHEDULED_DATE, channel: 'EMAIL' });
    repo.store.set(existingId, makeNotification({ id: existingId, channel: 'EMAIL', templateCode: 'TENANT_ETA_MORNING' }));
    const r = await notifier.notify(makeInput());
    expect(r).toEqual({ created: 1, duplicates: 1 });
  });

  // 8c
  it('stamps etaBandFromAt (ISO) on every row', async () => {
    await notifier.notify(makeInput());
    for (const row of storedRows()) {
      expect(row.payloadJson['etaBandFromAt']).toBe(BAND.from.toISOString());
    }
  });

  // 8d
  it('stamps serviceStartAt, planVersion and approximate from the fresh read (as strings)', async () => {
    await notifier.notify(makeInput({ planVersion: 7, approximate: true }));
    const row = storedRows()[0]!;
    expect(row.payloadJson['serviceStartAt']).toBe(B_START.toISOString());
    expect(row.payloadJson['planVersion']).toBe('7');
    expect(row.payloadJson['approximate']).toBe('true');
  });

  // 9
  it('alreadyNotified counts this appointment + code since agency-local midnight (SKIPPED/FAILED count)', async () => {
    expect(await notifier.alreadyNotified('DELAY', makePlanStop())).toBe(false);
    // A SKIPPED_OPT_OUT row from today still counts.
    repo.store.set('x', makeNotification({ tenantId: TENANT_ID, appointmentId: APPT_B, channel: 'SMS', templateCode: 'TENANT_ETA_DELAY', status: 'SKIPPED_OPT_OUT', createdAt: new Date('2026-11-04T21:00:00.000Z') }));
    expect(await notifier.alreadyNotified('DELAY', makePlanStop())).toBe(true);
    // A row from before local midnight (2026-11-04T13:00Z) does not count.
    repo = makeRepo(); rebuild();
    repo.store.set('y', makeNotification({ tenantId: TENANT_ID, appointmentId: APPT_B, channel: 'SMS', templateCode: 'TENANT_ETA_DELAY', status: 'SENT', createdAt: new Date('2026-11-04T12:59:00.000Z') }));
    expect(await notifier.alreadyNotified('DELAY', makePlanStop())).toBe(false);
  });

  // 10b
  it('reserves 20% of the SMS cap for mandatory notices (D15)', async () => {
    const seedSms = (n: number) => { for (let i = 0; i < n; i += 1) repo.store.set(`seed-${i}-${randomUUID()}`, makeNotification({ channel: 'SMS', createdAt: new Date('2026-11-04T21:00:00.000Z') })); };
    seedSms(79);
    const under = await notifier.notify(makeInput());
    expect(storedRows().filter((r) => r.channel === 'SMS' && r.templateCode === 'TENANT_ETA_MORNING')).toHaveLength(1);
    expect(under.created).toBe(2);

    repo = makeRepo(); rebuild(); seedSms(80);
    const over = await notifier.notify(makeInput());
    expect(storedRows().filter((r) => r.channel === 'SMS' && r.templateCode === 'TENANT_ETA_MORNING')).toHaveLength(0);
    expect(storedRows().filter((r) => r.channel === 'EMAIL' && r.templateCode === 'TENANT_ETA_MORNING')).toHaveLength(1);
    expect(over.created).toBe(1);

    repo = makeRepo(); rebuild();
    for (let i = 0; i < 40; i += 1) repo.store.set(`s${i}`, makeNotification({ channel: 'SMS', createdAt: new Date('2026-11-04T21:00:00.000Z') }));
    const cap50 = await notifier.notify(makeInput({ tenant: makeTenant({ notificationDailyCapSms: 50 }) }));
    expect(storedRows().filter((r) => r.channel === 'SMS' && r.templateCode === 'TENANT_ETA_MORNING')).toHaveLength(0);
    expect(cap50.created).toBe(1);

    repo = makeRepo(); rebuild();
    const cap0 = await notifier.notify(makeInput({ tenant: makeTenant({ notificationDailyCapSms: 0 }) }));
    expect(storedRows().filter((r) => r.channel === 'SMS')).toHaveLength(0);
    expect(cap0.created).toBe(1);
  });

  // 10c
  it('reserve with SMS_ELSE_EMAIL falls back to email, or nothing when phone-only', async () => {
    const seedSms = (n: number) => { for (let i = 0; i < n; i += 1) repo.store.set(`s-${i}`, makeNotification({ channel: 'SMS', createdAt: new Date('2026-11-04T21:00:00.000Z') })); };
    seedSms(80);
    const both = await notifier.notify(makeInput({ settings: { ...DEFAULT_SETTINGS, channelMode: 'SMS_ELSE_EMAIL' } }));
    expect(both.created).toBe(1);
    expect(storedRows().find((r) => r.templateCode === 'TENANT_ETA_MORNING')!.channel).toBe('EMAIL');

    repo = makeRepo(); rebuild(); seedSms(80);
    const phoneOnly = await notifier.notify(makeInput({
      settings: { ...DEFAULT_SETTINGS, channelMode: 'SMS_ELSE_EMAIL' },
      appointmentWithRelations: awrWith(makeContact(null, '+61412000003')),
    }));
    expect(phoneOnly.skippedReason).toBe('SMS_BUDGET_RESERVED');
    expect(storedRows().filter((r) => r.templateCode === 'TENANT_ETA_MORNING')).toHaveLength(0);
  });

  // 10d (UTC bucket, documented)
  it('the SMS budget bucket is per UTC day (documented; resets at Sydney 11:00 AEDT)', async () => {
    for (let i = 0; i < 80; i += 1) repo.store.set(`s${i}`, makeNotification({ channel: 'SMS', createdAt: new Date('2026-11-04T21:00:00.000Z') }));
    // Still the same UTC day at 10:59 Sydney → reserved.
    const reserved = await notifier.notify(makeInput({ now: new Date('2026-11-04T23:59:00.000Z') }));
    expect(reserved.created).toBe(1);
    // 11:00 Sydney = 00:00Z next day → startOfUtcDay excludes yesterday's rows → SMS flows again.
    // Fresh store so the next-day send is not a dedupe of the reserved call's EMAIL row.
    rebuild();
    for (let i = 0; i < 80; i += 1) repo.store.set(`y${i}`, makeNotification({ channel: 'SMS', createdAt: new Date('2026-11-04T21:00:00.000Z') }));
    const flows = await notifier.notify(makeInput({ now: new Date('2026-11-05T00:00:00.000Z') }));
    expect(flows.created).toBe(2);
  });

  // 10e
  it('does not read the SMS counter when there is no SMS leg', async () => {
    await notifier.notify(makeInput({ appointmentWithRelations: awrWith(makeContact('eve@example.com', null)) }));
    expect(repo.countByTenantChannelSince).not.toHaveBeenCalled();
  });

  // ── test helpers: rebuild resets the store so each sub-case is isolated ────
  function rebuild() {
    repo = makeRepo();
    const templateRepo = { findByTenantCodeChannel: vi.fn().mockResolvedValue(null), findAll: vi.fn(), upsert: vi.fn() };
    const jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    createNotification = new CreateNotificationUseCase(repo as never, templateRepo as never, jobQueue as never);
    notifier = new TenantEtaNotifier(
      createNotification, repo as never, new BuildNotificationPayloadService(),
      new AppointmentCodeFormatter(), 'https://app.properfy.me', metrics, logger as never,
    );
  }

  function awrWith(contact: AppointmentContactEntity | null, flowType = 'ROUTINE') {
    return {
      appointment: makeAppointment(), contact, contacts: contact ? [contact] : [], restrictions: [],
      propertyAddress: '1 B St, Surry Hills NSW 2010', branchName: 'BS', serviceTypeName: 'Routine',
      serviceTypeFlowType: flowType, inspectorName: 'Insp', hasActivePortalToken: false,
    } as unknown as TenantEtaNotifyInput['appointmentWithRelations'];
  }
});
