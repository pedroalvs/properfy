import type { AuthContext, InspectorAppStateInput } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import { InspectorNotFoundError } from '../../domain/inspector.errors';
import { type Clock, SystemClock } from '../../../../shared/domain/clock';
import type { Logger } from '../../../../shared/infrastructure/logger';

export interface RecordInspectorAppStateInput {
  actor: AuthContext;
  input: InspectorAppStateInput;
  requestId?: string;
}

/**
 * F01-1 / contract 00.10 — records the inspector app-state heartbeat.
 *
 * INSP only, acting on its own record. Telemetry: no audit (a `debug` log only).
 * The repository performs the whole update in one SQL statement; `affected === 0`
 * means the inspector is missing or soft-deleted → 404.
 */
export class RecordInspectorAppStateUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly clock: Clock = new SystemClock(),
    private readonly logger?: Logger,
  ) {}

  async execute({ actor, input, requestId }: RecordInspectorAppStateInput): Promise<void> {
    if (actor.role !== 'INSP' || !actor.inspectorId) {
      throw new ForbiddenError('INSP_ONLY', 'This endpoint is only accessible to inspectors');
    }

    // F02-1 (D10/L-F01-02): the heartbeat no longer writes push_enabled. That column now
    // means "has an active push subscription" and is maintained by the inspector-notice
    // module. `input.pushPermission` is still accepted but no longer persisted here.
    const affected = await this.inspectorRepo.recordAppState({
      id: actor.inspectorId,
      now: this.clock.now(),
      displayMode: input.displayMode,
      appVersion: input.appVersion,
    });

    if (affected === 0) {
      throw new InspectorNotFoundError();
    }

    this.logger?.debug(
      { inspectorId: actor.inspectorId, requestId, displayMode: input.displayMode },
      'inspector.app_state_recorded',
    );
  }
}
