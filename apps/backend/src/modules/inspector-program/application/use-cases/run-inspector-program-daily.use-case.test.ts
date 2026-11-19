import { describe, expect, it, vi } from 'vitest';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import {
  RunInspectorProgramDailyUseCase,
  ScheduleMessagesRunStep,
  type InspectorProgramDailyStep,
} from './run-inspector-program-daily.use-case';

const SYDNEY_0445 = new Date('2026-11-08T17:45:00.000Z'); // 2026-11-09 04:45 AEDT
const SYDNEY_0930 = new Date('2026-11-08T22:30:00.000Z'); // 2026-11-09 09:30 AEDT (past 08:00)

function recordingStep(phase: 'COMPUTE' | 'MESSAGES', ran: string[]): InspectorProgramDailyStep {
  return { name: `${phase}-step`, phase, run: async () => void ran.push(phase) };
}

describe('RunInspectorProgramDailyUseCase', () => {
  it('SCHEDULED runs the COMPUTE steps and enqueues the 08:00 message run', async () => {
    const ran: string[] = [];
    const enqueue = vi.fn(async () => {});
    const steps = [recordingStep('COMPUTE', ran), new ScheduleMessagesRunStep({ enqueue } as unknown as IJobQueue), recordingStep('MESSAGES', ran)];
    await new RunInspectorProgramDailyUseCase(steps).execute({ trigger: 'SCHEDULED', now: SYDNEY_0445 });

    expect(ran).toEqual(['COMPUTE']); // MESSAGES step not run in the COMPUTE phase
    expect(enqueue).toHaveBeenCalledWith(
      'inspector-program.daily',
      { trigger: 'MESSAGES' },
      { startAfter: new Date('2026-11-08T21:00:00.000Z'), singletonKey: 'inspector-program.messages:2026-11-09' },
    );
  });

  it('STARTUP after 08:00 enqueues the message run with startAfter = now', async () => {
    const enqueue = vi.fn(async () => {});
    await new RunInspectorProgramDailyUseCase([new ScheduleMessagesRunStep({ enqueue } as unknown as IJobQueue)]).execute({
      trigger: 'STARTUP',
      now: SYDNEY_0930,
    });
    expect(enqueue).toHaveBeenCalledWith(
      'inspector-program.daily',
      { trigger: 'MESSAGES' },
      { startAfter: SYDNEY_0930, singletonKey: 'inspector-program.messages:2026-11-09' },
    );
  });

  it('MESSAGES runs only the MESSAGE-phase steps and enqueues nothing', async () => {
    const ran: string[] = [];
    const enqueue = vi.fn(async () => {});
    const steps = [recordingStep('COMPUTE', ran), new ScheduleMessagesRunStep({ enqueue } as unknown as IJobQueue), recordingStep('MESSAGES', ran)];
    await new RunInspectorProgramDailyUseCase(steps).execute({ trigger: 'MESSAGES', now: SYDNEY_0930 });

    expect(ran).toEqual(['MESSAGES']);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
