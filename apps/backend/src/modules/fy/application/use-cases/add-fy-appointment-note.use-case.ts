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
 * inspector PWA already surfaces — no dedicated notes table in v1. The content
 * is stored verbatim, with no `[Fy <timestamp>]` prefix, so the inspector reads
 * a clean instruction. Fy authorship and the timestamp live only in the audit
 * log (`fy.note_added`), which the web surfaces on the appointment history
 * (Timeline) tab for operators to consult.
 */
export class AddFyAppointmentNoteUseCase {
  constructor(
    private readonly fyRepo: IFyRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: AddFyAppointmentNoteInput): Promise<FyNoteCreated> {
    const createdAt = new Date();

    const appended = await this.fyRepo.appendAppointmentNote(input.appointmentId, input.content);
    if (!appended) {
      throw new AppointmentNotFoundError();
    }

    this.auditService.log({
      action: 'fy.note_added',
      actorType: 'SYSTEM',
      actorId: input.actor.userId,
      entityType: 'Appointment',
      entityId: input.appointmentId,
      tenantId: appended.tenantId,
      after: { content: input.content },
    });

    return { content: input.content, createdAt: createdAt.toISOString() };
  }
}
