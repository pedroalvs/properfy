import type { AuthContext, InspectorWorkloadQuery, InspectorWorkloadResponse } from '@properfy/shared';
import { mondayOf } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';
import type { InspectorWorkloadRepository } from '../../domain/inspector-workload.repository';

/**
 * Roles that may read inspector workload.
 *
 * Deliberately narrower than `ANALYTICS_ROLES`, and not derived from it.
 * Inspectors are cross-tenant entities, so this screen aggregates every agency's
 * work against one roster. An agency actor would see only their own slice of an
 * inspector's week — a number the 15/18 capacity thresholds cannot interpret.
 */
const WORKLOAD_ROLES = ['AM', 'OP'];

export interface GetInspectorWorkloadInput {
  actor: AuthContext;
  query: InspectorWorkloadQuery;
  /** Injectable clock — only used to resolve the default week. */
  now?: Date;
}

export class GetInspectorWorkloadUseCase {
  constructor(private readonly repository: InspectorWorkloadRepository) {}

  async execute(input: GetInspectorWorkloadInput): Promise<InspectorWorkloadResponse> {
    const { actor, query } = input;

    if (!WORKLOAD_ROLES.includes(actor.role)) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions to view inspector workload');
    }

    // "Now" is the actor's civil date, not a server-local one: near midnight the
    // two disagree, and the wrong one silently reports the neighbouring week.
    const today = civilDateInTimezone(input.now ?? new Date(), actor.timezone ?? PLATFORM_TIMEZONE);
    const weekStart = query.weekStart ?? mondayOf(today);

    return this.repository.getWorkload({ weekStart });
  }
}
