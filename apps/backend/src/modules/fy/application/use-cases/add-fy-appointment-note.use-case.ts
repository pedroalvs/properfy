import type { AuthContext, FyNoteCreated } from '@properfy/shared';

import type { AuditService } from '../../../../shared/infrastructure/audit';
import { AppointmentNotFoundError } from '../../../appointment/domain/appointment.errors';
import type { IFyRepository } from '../../domain/fy.repository';

export interface AddFyAppointmentNoteInput {
  appointmentId: string;
  content: string;
  actor: AuthContext;
}

/**
 * Appends the note to the appointment's operational `notes` column, which the
 * inspector PWA already surfaces — no dedicated notes table in v1. Each entry
 * is timestamp-prefixed so authorship and ordering stay readable.
 */
export class AddFyAppointmentNoteUseCase {
  constructor(
    private readonly fyRepo: IFyRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: AddFyAppointmentNoteInput): Promise<FyNoteCreated> {
    const createdAt = new Date();
    const line = `[Fy ${createdAt.toISOString()}] ${input.content}`;

    const appended = await this.fyRepo.appendAppointmentNote(input.appointmentId, line);
    if (!appended) {
      throw new AppointmentNotFoundError();
    }

    this.auditService.log({
      action: 'fy.note_added',
      actorType: 'SYSTEM',
      actorId: input.actor.userId,
      entityType: 'appointment',
      entityId: input.appointmentId,
      tenantId: appended.tenantId,
      after: { content: input.content },
    });

    return { content: input.content, createdAt: createdAt.toISOString() };
  }
}
