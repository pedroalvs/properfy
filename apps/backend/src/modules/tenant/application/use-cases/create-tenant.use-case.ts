import type { AuthContext } from '@properfy/shared';
import { appointmentCodePrefixSchema } from '@properfy/shared';
import { ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { ITenantRepository } from '../../domain/tenant.repository';
import { TenantEntity } from '../../domain/tenant.entity';
import {
  TenantLegalNameConflictError,
  TenantAppointmentCodePrefixConflictError,
} from '../../domain/tenant.errors';
import type { IAppointmentTimeSlotRepository } from '../../../appointment-time-slot/domain/appointment-time-slot.repository';
import { AppointmentTimeSlotEntity } from '../../../appointment-time-slot/domain/appointment-time-slot.entity';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { TENANT_EVENTS } from '../../../../shared/application/events/domain-event-bus';

export interface CreateTenantInput {
  name: string;
  legalName: string;
  timezone: string;
  currency: string;
  appointmentCodePrefix: string;
  settings?: Record<string, unknown>;
  actor: AuthContext;
}

export interface CreateTenantOutput {
  id: string;
  name: string;
  legalName: string;
  status: string;
  timezone: string;
  currency: string;
  appointmentCodePrefix: string | null;
  settingsJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class CreateTenantUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly auditService: AuditService,
    private readonly timeSlotRepo: IAppointmentTimeSlotRepository,
    private readonly authorizationService: AuthorizationService,
    private readonly eventBus?: DomainEventBus,
  ) {}

  async execute(input: CreateTenantInput): Promise<CreateTenantOutput> {
    const { name, legalName, timezone, currency, settings, actor } = input;
    // Validate AND normalize here (not only in the shared route schema) so
    // non-route callers get a deterministic validation error and can't bypass
    // the "3-4 alphanumeric, uppercased, globally unique" contract.
    const prefixResult = appointmentCodePrefixSchema.safeParse(input.appointmentCodePrefix);
    if (!prefixResult.success) {
      throw new ValidationError('Invalid appointment code prefix', [
        { field: 'appointmentCodePrefix', message: 'Prefix must be 3–4 letters or numbers' },
      ]);
    }
    const appointmentCodePrefix = prefixResult.data;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'tenant.create',
      entityType: 'Tenant',
    });

    const existing = await this.tenantRepo.findByLegalName(legalName);
    if (existing) {
      throw new TenantLegalNameConflictError();
    }

    const prefixOwner = await this.tenantRepo.findByAppointmentCodePrefix(appointmentCodePrefix);
    if (prefixOwner) {
      throw new TenantAppointmentCodePrefixConflictError();
    }

    const now = new Date();
    const id = crypto.randomUUID();

    const tenant = new TenantEntity({
      id,
      name,
      legalName,
      status: 'PENDING',
      timezone,
      currency,
      appointmentCodePrefix,
      settingsJson: settings ?? {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.tenantRepo.save(tenant);
    await this.seedDefaultTimeSlots(id, now);

    this.auditService.log({
      action: 'tenant.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Tenant',
      entityId: id,
      after: {
        id,
        name,
        legalName,
        status: 'PENDING',
        timezone,
        currency,
        appointmentCodePrefix,
        settingsJson: tenant.settingsJson,
      },
    });

    this.eventBus?.emit({
      type: TENANT_EVENTS.CREATED,
      payload: { tenantId: id, name, legalName },
      occurredAt: new Date(),
    });

    return {
      id: tenant.id,
      name: tenant.name,
      legalName: tenant.legalName,
      status: tenant.status,
      timezone: tenant.timezone,
      currency: tenant.currency,
      appointmentCodePrefix: tenant.appointmentCodePrefix,
      settingsJson: tenant.settingsJson,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  private async seedDefaultTimeSlots(tenantId: string, now: Date): Promise<void> {
    const defaultSlots = [
      { label: '09:00 - 12:00', startTime: '09:00', endTime: '12:00', sortOrder: 1 },
      { label: '14:00 - 17:00', startTime: '14:00', endTime: '17:00', sortOrder: 2 },
    ];

    for (const slot of defaultSlots) {
      await this.timeSlotRepo.create(
        new AppointmentTimeSlotEntity({
          id: crypto.randomUUID(),
          tenantId,
          branchId: null,
          label: slot.label,
          startTime: slot.startTime,
          endTime: slot.endTime,
          sortOrder: slot.sortOrder,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }),
      );
    }
  }
}
