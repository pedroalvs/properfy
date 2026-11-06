/**
 * Shared fixtures for the F06-2 trigger tests. Uses the F06-1 A/B/C plan
 * (ag-syd, Sydney AEDT = UTC+11, 2026-11-05) so projectStopEta yields the known
 * example times (E1: A 08:00, B 09:00, C 10:25).
 */
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { EtaPlanStop, EtaPlanInput, EtaRealEvents, ProjectedStop } from '@properfy/shared';
import { NotificationEntity } from '../../../src/modules/notification/domain/notification.entity';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import type { FreshDayPlanStop } from '../../../src/modules/day-plan/application/use-cases/get-fresh-stop-for-appointment.use-case';
import type { LoadedTenantEtaPlan, TenantEtaStopMeta } from '../../../src/modules/tenant-eta/domain/tenant-eta-plan.reader';

export const TENANT_ID = 'ag-syd';
export const INSPECTOR_ID = 'insp-1';
export const DAY_PLAN_ID = 'dp-1';
export const PLAN_DATE = '2026-11-05';
export const TZ = 'Australia/Sydney';
export const NOW_0700 = new Date('2026-11-04T20:00:00.000Z'); // 07:00 Sydney
export const DEPARTURE_AT = new Date('2026-11-04T20:40:00.000Z'); // 07:40 Sydney

export const STOP_DEFS = {
  A: { id: 'appt-A', seq: 1, travelS: 1200, duration: 45, windowStart: '2026-11-04T21:00:00.000Z', windowEnd: '2026-11-04T23:00:00.000Z' },
  B: { id: 'appt-B', seq: 2, travelS: 900, duration: 60, windowStart: '2026-11-04T22:00:00.000Z', windowEnd: '2026-11-05T01:00:00.000Z' },
  C: { id: 'appt-C', seq: 3, travelS: 1500, duration: 45, windowStart: '2026-11-04T23:00:00.000Z', windowEnd: '2026-11-05T00:00:00.000Z' },
} as const;

export const CONTACTS: Record<string, { email: string | null; phone: string | null }> = {
  'appt-A': { email: 'ana@example.com', phone: '+61412000001' },
  'appt-B': { email: 'ben@example.com', phone: '+61412000002' },
  'appt-C': { email: null, phone: '+61412000003' },
};

export function makeStop(def: (typeof STOP_DEFS)[keyof typeof STOP_DEFS], overrides: Partial<EtaPlanStop> = {}): EtaPlanStop {
  return {
    appointmentId: def.id,
    sequence: def.seq,
    tenantId: TENANT_ID,
    scheduledDate: PLAN_DATE,
    appointmentStatus: 'SCHEDULED',
    travelS: def.travelS,
    durationMinutes: def.duration,
    windowStartAt: new Date(def.windowStart),
    windowEndAt: new Date(def.windowEnd),
    windowTimezone: TZ,
    missingCoordinates: false,
    serviceStartAt: new Date(def.windowStart),
    serviceEndAt: null,
    publishedServiceStartAt: new Date(def.windowStart),
    ...overrides,
  };
}

export function buildPlan(stops: EtaPlanStop[] = [makeStop(STOP_DEFS.A), makeStop(STOP_DEFS.B), makeStop(STOP_DEFS.C)], overrides: Partial<EtaPlanInput> = {}): EtaPlanInput {
  return {
    dayPlanId: DAY_PLAN_ID,
    planVersion: 1,
    planDate: PLAN_DATE,
    timezone: TZ,
    hasOrigin: true,
    departureAt: DEPARTURE_AT,
    approximate: false,
    stops,
    ...overrides,
  };
}

export function buildEvents(overrides: Partial<EtaRealEvents> = {}): EtaRealEvents {
  return { executions: new Map(), lateNotices: new Map(), ...overrides };
}

export function buildStopMeta(stops: EtaPlanStop[]): Map<string, TenantEtaStopMeta> {
  const map = new Map<string, TenantEtaStopMeta>();
  for (const s of stops) {
    map.set(s.appointmentId, { rentalTenantConfirmationStatus: 'CONFIRMED', keyRequired: false, requiresRentalTenantConfirmation: true });
  }
  return map;
}

export function buildLoadedPlan(opts: { plan?: EtaPlanInput; events?: EtaRealEvents; stopMeta?: Map<string, TenantEtaStopMeta> } = {}): LoadedTenantEtaPlan {
  const plan = opts.plan ?? buildPlan();
  return {
    plan,
    events: opts.events ?? buildEvents(),
    stopMeta: opts.stopMeta ?? buildStopMeta(plan.stops),
  };
}

export function makeTenant(settingsJson: Record<string, unknown> = {}): TenantEntity {
  return new TenantEntity({
    id: TENANT_ID, name: 'Syd', legalName: 'Syd LLC', status: 'ACTIVE', timezone: TZ,
    currency: 'AUD', settingsJson, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  });
}

export function makeAppointment(id: string, overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}): AppointmentEntity {
  return new AppointmentEntity({
    id, appointmentNumber: 1, tenantId: TENANT_ID, branchId: 'branch-1', propertyId: 'prop-1',
    serviceTypeId: 'st-1', inspectorId: INSPECTOR_ID, status: 'SCHEDULED',
    scheduledDate: new Date('2026-11-05T00:00:00.000Z'), timeSlotStart: '08:00', timeSlotEnd: '17:00',
    keyRequired: false, meetingLocation: null, keyLocation: null, rentalTenantConfirmationStatus: 'CONFIRMED',
    priceAmount: 100, payoutAmount: 80, pricingRuleSnapshotJson: {}, notes: null, customFieldsJson: null,
    reason: null, cancellationReasonCode: null, rejectionReasonCode: null, createdByUserId: 'user-1',
    doneMarkedByUserId: null, doneCheckedByUserId: null, doneCheckedAt: null, serviceGroupId: null,
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...overrides,
  });
}

export function makeContact(id: string): AppointmentContactEntity | null {
  const c = CONTACTS[id];
  if (!c || (!c.email && !c.phone)) {
    return new AppointmentContactEntity({
      id: `contact-${id}`, appointmentId: id, contactId: 'reg', role: 'RENTAL_TENANT', isPrimary: true,
      snapshotName: 'Tenant', snapshotEmail: c?.email ?? null, snapshotPhone: c?.phone ?? null,
      createdAt: new Date(), updatedAt: new Date(),
    });
  }
  return new AppointmentContactEntity({
    id: `contact-${id}`, appointmentId: id, contactId: 'reg', role: 'RENTAL_TENANT', isPrimary: true,
    snapshotName: 'Tenant', snapshotEmail: c.email, snapshotPhone: c.phone,
    createdAt: new Date(), updatedAt: new Date(),
  });
}

export function makeAwr(id: string, flowType = 'ROUTINE', contact = makeContact(id)) {
  return {
    appointment: makeAppointment(id), contact, contacts: contact ? [contact] : [], restrictions: [],
    propertyAddress: '1 St, Surry Hills NSW 2010', branchName: 'BS', serviceTypeName: 'Routine',
    serviceTypeFlowType: flowType, inspectorName: 'Insp', hasActivePortalToken: false,
  } as unknown;
}

export function makeFreshStop(overrides: Partial<FreshDayPlanStop> = {}): FreshDayPlanStop {
  return {
    status: 'FRESH', dayPlanId: DAY_PLAN_ID, planVersion: 1, serviceStartAt: null, eta: null,
    lateS: 0, approximate: false, manual: false, executed: false, ...overrides,
  };
}

export function makeNotification(overrides: Partial<ConstructorParameters<typeof NotificationEntity>[0]>): NotificationEntity {
  const now = new Date();
  return new NotificationEntity({
    id: randomUUID(), tenantId: TENANT_ID, appointmentId: null, recipient: 'r@x.local',
    channel: 'SMS', templateCode: 'OTHER', status: 'SENT', notificationClass: null,
    providerName: null, providerMessageId: null, sentAt: null, deliveredAt: null,
    failedAt: null, failureReason: null, payloadJson: {}, retryCount: 0, nextRetryAt: null,
    createdAt: now, updatedAt: now, ...overrides,
  });
}

/** An in-memory notification repo sufficient for the trigger use cases + CreateNotificationUseCase. */
export function makeNotificationRepo() {
  const store = new Map<string, NotificationEntity>();
  return {
    store,
    saveIfAbsent: vi.fn(async (n: NotificationEntity) => {
      if (store.has(n.id)) return false;
      store.set(n.id, n);
      return true;
    }),
    save: vi.fn(async (n: NotificationEntity) => { store.set(n.id, n); }),
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
        if (n.tenantId !== tenantId || n.channel !== channel) continue;
        if (n.createdAt < since) continue;
        if (n.status === 'SKIPPED' || n.status === 'SKIPPED_OPT_OUT') continue;
        c += 1;
      }
      return c;
    }),
  };
}

export const SETTINGS = {
  enabled: true, channelMode: 'BOTH', morningHour: 7, morningCutoffHour: 9,
  delayThresholdMinutes: 20, smsBudgetSharePercent: 80,
} as const;

/** Convenience: a no-op logger whose calls can be inspected. */
export function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

/** The projected stop for an appointment id (helper for assertions). */
export function projectedFor(projection: ProjectedStop[], id: string): ProjectedStop | undefined {
  return projection.find((p) => p.appointmentId === id);
}
