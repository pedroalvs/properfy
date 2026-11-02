import { addCivilDays, type AuthContext } from '@properfy/shared';
import { type Clock, SystemClock } from '../../../../shared/domain/clock';
import type { AuditService } from '../../../../shared/domain/audit';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';
import { ForbiddenError } from '../../../../shared/domain/errors';
import {
  dayPlanSheetSlug,
  type DayPlanSheetFormat,
  type DayPlanSheetRenderer,
} from '../../infrastructure/day-plan-sheet.renderer';
import { dayPlanSheetTooOld } from '../../domain/day-plan.errors';
import type { GetMyDayPlanUseCase } from './get-my-day-plan.use-case';
import type { GetDayPlanForOperatorUseCase } from './get-day-plan-for-operator.use-case';

/** INSP may export the last 30 days of plans; AM/OP have no limit (L-F04-10). */
const INSPECTOR_SHEET_MAX_AGE_DAYS = 30;

const CONTENT_TYPE: Record<DayPlanSheetFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export interface GetDayPlanSheetInput {
  actor: AuthContext;
  date: string;
  format: DayPlanSheetFormat;
  /** Required for AM/OP; ignored for INSP (their own plan). */
  inspectorId?: string;
  now?: Date;
}

export interface GetDayPlanSheetResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/**
 * Route sheet download (contract 01.A6, L-F04-10). Recomputes the plan through the
 * same read path as the GET (so INSP gets the L-F04-01 no-routing STALE clear),
 * enforces the 30-day INSP limit, renders PDF/XLSX, and writes a `day_plan.exported`
 * audit carrying no personal data (format/date/stop-count/actorRole only).
 */
export class GetDayPlanSheetUseCase {
  constructor(
    private readonly getMyDayPlan: GetMyDayPlanUseCase,
    private readonly getForOperator: GetDayPlanForOperatorUseCase,
    private readonly renderer: DayPlanSheetRenderer,
    private readonly audit: AuditService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(input: GetDayPlanSheetInput): Promise<GetDayPlanSheetResult> {
    const { actor, date, format } = input;
    const now = input.now ?? this.clock.now();

    const plan =
      actor.role === 'INSP'
        ? await this.readOwnPlan(actor, date, now)
        : await this.getForOperator.execute({ actor, inspectorId: input.inspectorId ?? '', date, now });

    const buffer = await this.renderer.render(plan, format);

    this.audit.log({
      action: 'day_plan.exported',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'DayPlan',
      entityId: plan.id,
      tenantId: null,
      metadata: { format, date, stops: plan.stops.length, actorRole: actor.role },
    });

    return {
      buffer,
      contentType: CONTENT_TYPE[format],
      filename: `route-${dayPlanSheetSlug(plan.inspectorName)}-${date}.${format}`,
    };
  }

  private async readOwnPlan(actor: AuthContext, date: string, now: Date) {
    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Your account is not linked to an inspector profile');
    }
    const today = civilDateInTimezone(now, PLATFORM_TIMEZONE);
    if (date < addCivilDays(today, -INSPECTOR_SHEET_MAX_AGE_DAYS)) {
      throw dayPlanSheetTooOld();
    }
    return this.getMyDayPlan.execute({ inspectorId: actor.inspectorId, date, now });
  }
}
