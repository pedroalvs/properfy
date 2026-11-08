import { PLATFORM_TIMEZONE } from '@properfy/shared';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import type { CivilDate } from '../../domain/goal.entity';
import { messagesRunAt } from '../../domain/messages-run-at';

export type InspectorProgramDailyTrigger = 'SCHEDULED' | 'STARTUP' | 'MESSAGES';

/** Shared context threaded through the daily steps (L-F08-01). */
export interface InspectorProgramDailyStepContext {
  now: Date;
  today: CivilDate;
  trigger: InspectorProgramDailyTrigger;
  /** Award ids created this run, so the message steps (TASK-F08-4) can read them. */
  createdAwardIds: string[];
}

export interface InspectorProgramDailyStep {
  readonly name: string;
  readonly phase: 'COMPUTE' | 'MESSAGES';
  run(ctx: InspectorProgramDailyStepContext): Promise<void>;
}

export const INSPECTOR_PROGRAM_DAILY_QUEUE = 'inspector-program.daily';

/**
 * Orchestrates the daily inspector-program run by trigger (L-F08-01):
 * `SCHEDULED`/`STARTUP` run the COMPUTE steps (close periods, then enqueue the
 * 08:00 messages run); `MESSAGES` runs only the MESSAGE steps that TASK-F08-4
 * registers. There is only ever one pg-boss schedule for the queue.
 */
export class RunInspectorProgramDailyUseCase {
  constructor(private readonly steps: InspectorProgramDailyStep[]) {}

  async execute(input: { trigger: InspectorProgramDailyTrigger; now: Date }): Promise<void> {
    const today = civilDateInTimezone(input.now, PLATFORM_TIMEZONE);
    const phase: 'COMPUTE' | 'MESSAGES' = input.trigger === 'MESSAGES' ? 'MESSAGES' : 'COMPUTE';
    const ctx: InspectorProgramDailyStepContext = {
      now: input.now,
      today,
      trigger: input.trigger,
      createdAwardIds: [],
    };
    for (const step of this.steps) {
      if (step.phase === phase) await step.run(ctx);
    }
  }
}

/**
 * Last COMPUTE step: enqueue the 08:00 message run on the same queue with a
 * per-day singleton key, so the compute run never sends messages itself and no
 * second `boss.schedule` is created (pg-boss 9 keeps one schedule per name).
 */
export class ScheduleMessagesRunStep implements InspectorProgramDailyStep {
  readonly name = 'schedule-messages-run';
  readonly phase = 'COMPUTE' as const;

  constructor(private readonly jobQueue: IJobQueue) {}

  async run(ctx: InspectorProgramDailyStepContext): Promise<void> {
    await this.jobQueue.enqueue(
      INSPECTOR_PROGRAM_DAILY_QUEUE,
      { trigger: 'MESSAGES' },
      { startAfter: messagesRunAt(ctx.now), singletonKey: `inspector-program.messages:${ctx.today}` },
    );
  }
}
