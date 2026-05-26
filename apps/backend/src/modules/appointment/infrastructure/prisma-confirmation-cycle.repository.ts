import type { PrismaClient, Prisma } from '@prisma/client';
import type { CycleStatus, CycleConfirmationSource, CycleInvalidatedReason } from '@properfy/shared';
import { ConfirmationCycleEntity } from '../domain/confirmation-cycle.entity';
import type { IConfirmationCycleRepository } from '../domain/confirmation-cycle.repository';

type DbClient = PrismaClient | Prisma.TransactionClient;

function mapToEntity(row: any): ConfirmationCycleEntity {
  return new ConfirmationCycleEntity({
    id: row.id,
    appointmentId: row.appointment_id,
    cycleNumber: row.cycle_number,
    scheduledDate: row.scheduled_date,
    timeSlot: row.time_slot ?? null,
    status: row.status as CycleStatus,
    confirmationSource: (row.confirmation_source as CycleConfirmationSource) ?? null,
    confirmedAt: row.confirmed_at ?? null,
    invalidatedAt: row.invalidated_at ?? null,
    invalidatedReason: (row.invalidated_reason as CycleInvalidatedReason) ?? null,
    portalTokenId: row.portal_token_id ?? null,
    createdAt: row.created_at,
  });
}

export class PrismaConfirmationCycleRepository implements IConfirmationCycleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

  async save(cycle: ConfirmationCycleEntity, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).appointmentConfirmationCycle.create({
      data: {
        id: cycle.id,
        appointment_id: cycle.appointmentId,
        cycle_number: cycle.cycleNumber,
        scheduled_date: cycle.scheduledDate,
        time_slot: cycle.timeSlot,
        status: cycle.status as never,
        confirmation_source: cycle.confirmationSource as never ?? undefined,
        confirmed_at: cycle.confirmedAt,
        invalidated_at: cycle.invalidatedAt,
        invalidated_reason: cycle.invalidatedReason as never ?? undefined,
        portal_token_id: cycle.portalTokenId,
        created_at: cycle.createdAt,
      },
    });
  }

  async update(cycle: ConfirmationCycleEntity, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).appointmentConfirmationCycle.update({
      where: { id: cycle.id },
      data: {
        status: cycle.status as never,
        confirmation_source: cycle.confirmationSource as never ?? undefined,
        confirmed_at: cycle.confirmedAt,
        invalidated_at: cycle.invalidatedAt,
        invalidated_reason: cycle.invalidatedReason as never ?? undefined,
        portal_token_id: cycle.portalTokenId,
      },
    });
  }

  async findActiveByAppointmentId(
    appointmentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ConfirmationCycleEntity | null> {
    const row = await this.db(tx).appointmentConfirmationCycle.findFirst({
      where: {
        appointment_id: appointmentId,
        status: { not: 'SUPERSEDED' as never },
      },
    });
    return row ? mapToEntity(row) : null;
  }

  async findById(id: string, tx?: Prisma.TransactionClient): Promise<ConfirmationCycleEntity | null> {
    const row = await this.db(tx).appointmentConfirmationCycle.findUnique({
      where: { id },
    });
    return row ? mapToEntity(row) : null;
  }

  async findMaxCycleNumber(appointmentId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const result = await this.db(tx).appointmentConfirmationCycle.aggregate({
      where: { appointment_id: appointmentId },
      _max: { cycle_number: true },
    });
    return result._max.cycle_number ?? 0;
  }
}
