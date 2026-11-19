import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SendCompletionRemindersUseCase } from './send-completion-reminders.use-case';

// Pinned: 2026-11-04T00:31:00Z === 11:31 in Australia/Sydney (AEDT +11) on 2026-11-04.
// Window ends 11:00 Sydney (= 00:00Z); with a 30-min delay the reminder is due at 00:30Z.
const NOW_ISO = '2026-11-04T00:31:00.000Z';
const SCHEDULED_DATE = new Date('2026-11-04T00:00:00.000Z');

const SETTINGS = {
  geofenceRadiusMeters: 300,
  geofenceMode: 'FLAG' as const,
  checkInWindowToleranceMinutes: 15,
  completionReminderEnabled: true,
  completionReminderMinutesAfterWindowEnd: 30,
};

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    appointmentId: 'apt-1',
    tenantId: 'tenant-1',
    inspectorId: 'insp-1',
    appointmentCode: 'INS-0042',
    propertyAddress: '12 King St, Newtown',
    scheduledDate: SCHEDULED_DATE,
    timeSlotEnd: '11:00',
    executionState: 'NONE' as const,
    ...overrides,
  };
}

function build(opts: {
  candidates?: unknown[];
  inProgress?: unknown[];
  settings?: Record<string, unknown>;
  publish?: { execute: ReturnType<typeof vi.fn> };
} = {}) {
  const reader = {
    findCandidates: vi.fn().mockResolvedValue(opts.candidates ?? [candidate()]),
    findInProgressByInspectorIds: vi.fn().mockResolvedValue(opts.inProgress ?? []),
  };
  const platformSettings = {
    get: vi.fn().mockResolvedValue({ ...SETTINGS, ...opts.settings }),
  };
  const tenantTimezoneLookup = { getTenantTimezone: vi.fn().mockResolvedValue('Australia/Sydney') };
  const publishNotice =
    opts.publish ?? { execute: vi.fn().mockResolvedValue({ noticeId: 'n1', created: true }) };
  const auditService = { log: vi.fn() };
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const useCase = new SendCompletionRemindersUseCase(
    reader as never,
    platformSettings as never,
    tenantTimezoneLookup as never,
    publishNotice as never,
    auditService as never,
    logger as never,
  );
  return { useCase, reader, publishNotice, auditService, logger };
}

describe('SendCompletionRemindersUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the not-started reminder for a job past its window with no check-in', async () => {
    const ctx = build();
    const summary = await ctx.useCase.execute();

    expect(ctx.publishNotice.execute).toHaveBeenCalledWith({
      type: 'COMPLETION_REMINDER',
      inspectorIds: ['insp-1'],
      title: 'Finish your inspection',
      body: "INS-0042 at 12 King St, Newtown was due by 11:00. Check in when you arrive, or tell operations if you can't do it.",
      dedupeKey: 'completion-reminder:apt-1:2026-11-04:insp-1',
      targetPath: '/schedule/apt-1',
    });
    expect(ctx.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspection.completion_reminder_sent',
        actorType: 'SYSTEM',
        metadata: expect.objectContaining({ noticeId: 'n1', variant: 'NOT_STARTED' }),
      }),
    );
    expect(summary).toMatchObject({ candidates: 1, sent: 1, skippedAlreadySent: 0, skippedBusy: 0, failed: 0 });
  });

  it('sends the "did you finish?" reminder when a check-in is still open', async () => {
    const ctx = build({ candidates: [candidate({ executionState: 'IN_PROGRESS' })] });
    await ctx.useCase.execute();
    expect(ctx.publishNotice.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Did you finish INS-0042 at 12 King St, Newtown? Check out in the app so the job is marked done.',
      }),
    );
    expect(ctx.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ variant: 'IN_PROGRESS' }) }),
    );
  });

  it('does not audit and counts skippedAlreadySent when F02 deduplicates', async () => {
    const ctx = build({ publish: { execute: vi.fn().mockResolvedValue({ noticeId: 'n1', created: false }) } });
    const summary = await ctx.useCase.execute();
    expect(ctx.auditService.log).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ sent: 0, skippedAlreadySent: 1 });
  });

  it('suppresses the reminder when the inspector is busy on another job started after this window', async () => {
    const ctx = build({
      inProgress: [{ inspectorId: 'insp-1', appointmentId: 'apt-2', startedAt: new Date('2026-11-04T00:10:00.000Z') }],
    });
    const summary = await ctx.useCase.execute();
    expect(ctx.publishNotice.execute).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ skippedBusy: 1, sent: 0 });
  });

  it('does not suppress when the other job started before this window closed', async () => {
    const ctx = build({
      inProgress: [{ inspectorId: 'insp-1', appointmentId: 'apt-2', startedAt: new Date('2026-11-03T23:50:00.000Z') }],
    });
    const summary = await ctx.useCase.execute();
    expect(ctx.publishNotice.execute).toHaveBeenCalled();
    expect(summary).toMatchObject({ sent: 1, skippedBusy: 0 });
  });

  it('does nothing before the window + delay has elapsed', async () => {
    vi.setSystemTime(new Date('2026-11-04T00:29:00.000Z')); // 11:29 Sydney, due at 11:30
    const ctx = build();
    const summary = await ctx.useCase.execute();
    expect(ctx.publishNotice.execute).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ candidates: 0, sent: 0 });
  });

  it('skips a finished execution defensively', async () => {
    const ctx = build({ candidates: [candidate({ executionState: 'FINISHED' })] });
    const summary = await ctx.useCase.execute();
    expect(ctx.publishNotice.execute).not.toHaveBeenCalled();
    expect(summary.candidates).toBe(0);
  });

  it('does nothing when completion reminders are disabled', async () => {
    const ctx = build({ settings: { completionReminderEnabled: false } });
    const summary = await ctx.useCase.execute();
    expect(ctx.reader.findCandidates).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
  });

  it('counts a publish failure and continues', async () => {
    const ctx = build({ publish: { execute: vi.fn().mockRejectedValue(new Error('boom')) } });
    const summary = await ctx.useCase.execute();
    expect(summary).toMatchObject({ failed: 1, sent: 0 });
    expect(ctx.logger.error).toHaveBeenCalled();
  });

  it('never leaks tenant PII into the reminder (locked-screen safe)', async () => {
    const ctx = build();
    await ctx.useCase.execute();
    const { body, title } = ctx.publishNotice.execute.mock.calls[0]![0];
    const text = `${title} ${body}`;
    // Only the service code, address and window end — never the tenant/contact details.
    for (const secret of ['Mary Tenant', '+61412345678', 'Lockbox 4821']) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('INS-0042');
    expect(text).toContain('12 King St, Newtown');
  });
});
