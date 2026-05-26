import type { Prisma } from '@prisma/client';
import type { ConfirmationCycleEntity } from './confirmation-cycle.entity';

export interface IConfirmationCycleRepository {
  save(cycle: ConfirmationCycleEntity, tx?: Prisma.TransactionClient): Promise<void>;
  update(cycle: ConfirmationCycleEntity, tx?: Prisma.TransactionClient): Promise<void>;
  findActiveByAppointmentId(appointmentId: string, tx?: Prisma.TransactionClient): Promise<ConfirmationCycleEntity | null>;
  findById(id: string, tx?: Prisma.TransactionClient): Promise<ConfirmationCycleEntity | null>;
  findMaxCycleNumber(appointmentId: string, tx?: Prisma.TransactionClient): Promise<number>;
}
