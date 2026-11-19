/**
 * Platform settings — real database (F03-1).
 *
 * Proves the new `platform_settings` table + its migration, the audit row
 * (`tenant_id` NULL), the `platform_setting.updated.v1` event, the registry
 * defaults, the save path and the RBAC scoping premise, end-to-end against
 * real Postgres. Drives the use cases directly (the established integration-db
 * pattern), with real repositories, a real audit service and a real event bus.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaPlatformSettingRepository } from '../../../src/modules/platform-settings/infrastructure/prisma-platform-setting.repository';
import { PlatformSettingsService } from '../../../src/modules/platform-settings/application/platform-settings.service';
import { ListPlatformSettingsUseCase } from '../../../src/modules/platform-settings/application/use-cases/list-platform-settings.use-case';
import { GetPlatformSettingUseCase } from '../../../src/modules/platform-settings/application/use-cases/get-platform-setting.use-case';
import { UpdatePlatformSettingUseCase } from '../../../src/modules/platform-settings/application/use-cases/update-platform-setting.use-case';
import { PrismaAuditLogRepository } from '../../../src/modules/audit/infrastructure/prisma-audit-log.repository';
import { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { DomainEventBus } from '../../../src/shared/application/events/domain-event-bus';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';
import { PlatformSettingUnknownKeyError } from '../../../src/modules/platform-settings/domain/platform-settings.errors';

const silentLogger = () => ({ info() {}, warn() {}, error() {}, debug() {} }) as any;

const VALID = {
  geofenceRadiusMeters: 150,
  geofenceMode: 'FLAG' as const,
  checkInWindowToleranceMinutes: 20,
  completionReminderEnabled: true,
  completionReminderMinutesAfterWindowEnd: 45,
};

describe('Platform settings (real DB)', () => {
  let harness: DbHarness;
  let amActor: AuthContext;
  let opActor: AuthContext;

  beforeAll(async () => {
    harness = await setupDbHarness();
    const am = await harness.prisma.user.create({
      data: { role: 'AM', name: 'PS AM', email: `ps-am-${Math.random().toString(36).slice(2, 9)}@test.local`, password_hash: 'x' },
    });
    const op = await harness.prisma.user.create({
      data: { role: 'OP', name: 'PS OP', email: `ps-op-${Math.random().toString(36).slice(2, 9)}@test.local`, password_hash: 'x' },
    });
    amActor = { userId: am.id, tenantId: null, role: 'AM', branchId: null, inspectorId: null };
    opActor = { userId: op.id, tenantId: null, role: 'OP', branchId: null, inspectorId: null };
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function build() {
    const repo = new PrismaPlatformSettingRepository(harness.prisma);
    const auditService = new PersistentAuditService(new PrismaAuditLogRepository(harness.prisma), silentLogger());
    const auth = new AuthorizationService(auditService as any);
    const settingsService = new PlatformSettingsService(repo, silentLogger());
    const bus = new DomainEventBus();
    const events: unknown[] = [];
    bus.subscribe('platform_setting.updated.v1', (e) => { events.push(e.payload); });
    const list = new ListPlatformSettingsUseCase(repo, auth);
    const get = new GetPlatformSettingUseCase(repo, auth);
    const update = new UpdatePlatformSettingUseCase(repo, auth, auditService as any, settingsService, bus, silentLogger());
    return { repo, list, get, update, bus, events };
  }

  it('lists defaults, writes with a NULL-tenant audit, reads back, emits the event, and enforces RBAC', async () => {
    const { list, get, update, events } = build();

    // Defaults before any write.
    const before = await list.execute({ actor: amActor });
    const fieldEvents = before.settings.find((s) => s.key === 'fieldEvents')!;
    expect(fieldEvents.isDefault).toBe(true);
    expect(fieldEvents.updatedAt).toBeNull();
    expect(fieldEvents.updatedBy).toBeNull();

    // PUT as OP.
    await update.execute({ key: 'fieldEvents', value: VALID, actor: opActor });

    const row = await harness.prisma.platformSetting.findUnique({ where: { key: 'fieldEvents' } });
    expect(row).not.toBeNull();

    const auditRows = await harness.prisma.auditLog.findMany({ where: { action: 'platform_setting.updated' } });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    expect(auditRows[auditRows.length - 1]!.tenant_id).toBeNull();

    // Event delivered.
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({ key: 'fieldEvents', actorId: opActor.userId });

    // Read back: not default, has updatedBy.
    const after = await get.execute({ key: 'fieldEvents', actor: amActor });
    expect(after.isDefault).toBe(false);
    expect((after.value as any).checkInWindowToleranceMinutes).toBe(20);
    expect(after.updatedBy).not.toBeNull();
  });

  it('enforces the scoping premise: CL_ADMIN and INSP cannot read or write', async () => {
    const { list, get, update } = build();
    const cl: AuthContext = { userId: 'cl-x', tenantId: 'tenant-x', role: 'CL_ADMIN', branchId: null, inspectorId: null };
    const insp: AuthContext = { userId: 'i-x', tenantId: null, role: 'INSP', branchId: null, inspectorId: 'insp-x' };
    for (const actor of [cl, insp]) {
      await expect(list.execute({ actor })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(get.execute({ key: 'fieldEvents', actor })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(update.execute({ key: 'fieldEvents', value: VALID, actor })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('rejects an out-of-range value (400) and an unknown key (404)', async () => {
    const { update } = build();
    await expect(
      update.execute({ key: 'fieldEvents', value: { ...VALID, geofenceRadiusMeters: 10 }, actor: amActor }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      update.execute({ key: 'unknownKey', value: VALID, actor: amActor }),
    ).rejects.toBeInstanceOf(PlatformSettingUnknownKeyError);
  });
});
