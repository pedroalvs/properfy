import type { AuthContext } from '@properfy/shared';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  ExecutionNotStartedError,
  ExecutionAlreadyFinishedError,
} from '../../domain/inspection-execution.errors';

export interface SaveExecutionProgressInput {
  appointmentId: string;
  checklistJson?: Record<string, unknown>;
  notes?: string;
  actor: AuthContext;
}

export interface SaveExecutionProgressOutput {
  executionId: string;
  appointmentId: string;
  checklistJson: Record<string, unknown> | null;
  notes: string | null;
  updatedAt: string;
}

export class SaveExecutionProgressUseCase {
  constructor(
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: SaveExecutionProgressInput): Promise<SaveExecutionProgressOutput> {
    const { appointmentId, checklistJson, notes, actor } = input;

    // 1. INSP only
    this.authorizationService.assertRoles(actor, ['INSP'], {
      action: 'appointment.mark_done',
      entityType: 'InspectionExecution',
    });

    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
    }

    // 2. Load execution
    const execution = await this.executionRepo.findByAppointmentId(appointmentId);
    if (!execution) throw new ExecutionNotStartedError();

    // 3. Validate inspector ownership
    if (execution.inspectorId !== actor.inspectorId) {
      throw new ForbiddenError('FORBIDDEN', 'Inspection execution is not assigned to this inspector');
    }

    // 4. Check not finished
    if (execution.isFinished()) throw new ExecutionAlreadyFinishedError();

    // 5. Build update payload (only update provided fields)
    const updateData: Partial<{
      checklistJson: Record<string, unknown> | null;
      notes: string | null;
    }> = {};

    if (checklistJson !== undefined) {
      updateData.checklistJson = checklistJson;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    // 6. Update execution
    await this.executionRepo.update(execution.id, updateData);

    // 7. Return updated state
    return {
      executionId: execution.id,
      appointmentId: execution.appointmentId,
      checklistJson: checklistJson !== undefined ? checklistJson : execution.checklistJson,
      notes: notes !== undefined ? notes : execution.notes,
      updatedAt: new Date().toISOString(),
    };
  }
}
