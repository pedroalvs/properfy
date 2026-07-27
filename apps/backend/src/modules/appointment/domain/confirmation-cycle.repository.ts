import type { Prisma } from '@prisma/client';
import type { ConfirmationCycleEntity } from './confirmation-cycle.entity';

export interface IConfirmationCycleRepository {
  save(cycle: ConfirmationCycleEntity, tx?: Prisma.TransactionClient): Promise<void>;
  update(cycle: ConfirmationCycleEntity, tx?: Prisma.TransactionClient): Promise<void>;
  findActiveByAppointmentId(appointmentId: string, tx?: Prisma.TransactionClient): Promise<ConfirmationCycleEntity | null>;
  findById(id: string, tx?: Prisma.TransactionClient): Promise<ConfirmationCycleEntity | null>;
  findMaxCycleNumber(appointmentId: string, tx?: Prisma.TransactionClient): Promise<number>;
  /**
   * Move an existing cycle onto a new schedule while leaving its status alone.
   *
   * `update` deliberately never writes `scheduled_date`/`time_slot` — a cycle's
   * schedule is normally immutable and a change rotates it instead. This is the
   * one exception: when an operator moves a group's schedule but chooses to keep
   * the tenants' confirmations, the surviving cycle has to point at the new time,
   * otherwise it reads as confirmed-for-a-date-that-no-longer-exists and every
   * later portal-link plan wants to resend it.
   */
  realignSchedule(
    cycleId: string,
    scheduledDate: Date,
    timeSlot: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
