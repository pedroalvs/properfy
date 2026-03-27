import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ITenantRepository } from '../../domain/tenant.repository';
import { TenantEntity } from '../../domain/tenant.entity';
import { TenantLegalNameConflictError } from '../../domain/tenant.errors';
import type { IAppointmentTimeSlotRepository } from '../../../appointment-time-slot/domain/appointment-time-slot.repository';
import { AppointmentTimeSlotEntity } from '../../../appointment-time-slot/domain/appointment-time-slot.entity';

export interface CreateTenantInput {
  name: string;
  legalName: string;
  timezone: string;
  currency: string;
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
  settingsJson: Record<string, unknown>;
  createdAt: Date;
}

export class CreateTenantUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly auditService: AuditService,
    private readonly timeSlotRepo: IAppointmentTimeSlotRepository,
  ) {}

  async execute(input: CreateTenantInput): Promise<CreateTenantOutput> {
    const { name, legalName, timezone, currency, settings, actor } = input;

    if (actor.role !== 'AM') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const existing = await this.tenantRepo.findByLegalName(legalName);
    if (existing) {
      throw new TenantLegalNameConflictError();
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
        settingsJson: tenant.settingsJson,
      },
    });

    return {
      id: tenant.id,
      name: tenant.name,
      legalName: tenant.legalName,
      status: tenant.status,
      timezone: tenant.timezone,
      currency: tenant.currency,
      settingsJson: tenant.settingsJson,
      createdAt: tenant.createdAt,
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
