import type { AuthContext, ProgramPeriodsQuery, ProgramPeriodsResponse } from '@properfy/shared';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import { computeClosedPeriods, getCanonicalPeriod } from '../../../billing/domain/billing-period.service';
import type { CivilDate } from '../../domain/goal.entity';

const MS_PER_DAY = 86_400_000;
function addCivilDays(ymd: CivilDate, days: number): CivilDate {
  return new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export interface ListProgramPeriodsCommand {
  actor: AuthContext;
  query: ProgramPeriodsQuery;
}

/**
 * Canonical period list for the AM/OP selectors (DL10, FR-027). `upcoming` starts
 * at the current period (`IN_PROGRESS`) and walks forward; `past` starts at the
 * last closed period and walks backward (newest first), never including the
 * current one. "today" is civil in `PLATFORM_TIMEZONE`.
 */
export class ListProgramPeriodsUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute({ actor, query }: ListProgramPeriodsCommand): Promise<ProgramPeriodsResponse> {
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector_program.goals.manage',
      entityType: 'InspectorGoal',
    });

    const now = this.clock.now();
    if (query.direction === 'past') {
      const closed = computeClosedPeriods(query.periodType, now, query.count);
      return {
        data: closed.map((p) => ({ start: p.periodStart, end: p.periodEnd, status: 'CLOSED' as const })),
      };
    }

    // upcoming: current period first, then forward.
    const today = civilDateInTimezone(now, PLATFORM_TIMEZONE);
    const data: ProgramPeriodsResponse['data'] = [];
    let cursor = today;
    for (let i = 0; i < query.count; i += 1) {
      const period = getCanonicalPeriod(query.periodType, cursor);
      data.push({ start: period.periodStart, end: period.periodEnd, status: i === 0 ? 'IN_PROGRESS' : 'UPCOMING' });
      cursor = addCivilDays(period.periodEnd, 1);
    }
    return { data };
  }
}
