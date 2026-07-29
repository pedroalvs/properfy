import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotifyOnGroupInspectorChangeSubscriber } from '../../../src/modules/notification/application/subscribers/notify-on-group-inspector-change.subscriber';
import { SERVICE_GROUP_EVENTS } from '../../../src/shared/application/events/domain-event-bus';

function makeGroupResult(overrides: Record<string, unknown> = {}) {
  return {
    group: {
      id: 'group-1',
      groupNumber: 42,
      scheduledDate: new Date('2026-06-01'),
      timeWindow: '09:00-12:00',
      groupSize: 2,
    },
    tenantIds: ['tenant-1'],
    primaryTenantId: 'tenant-1',
    appointments: [{ id: 'appt-1' }, { id: 'appt-2' }],
    ...overrides,
  };
}

function setup(options: { group?: unknown; inspectors?: Record<string, unknown> } = {}) {
  const serviceGroupRepo = {
    findById: vi.fn().mockResolvedValue(options.group === undefined ? makeGroupResult() : options.group),
  };
  const inspectors: Record<string, unknown> = options.inspectors ?? {
    'insp-old': { id: 'insp-old', name: 'Old Inspector', email: 'old@example.com' },
    'insp-new': { id: 'insp-new', name: 'New Inspector', email: 'new@example.com' },
  };
  const inspectorRepo = { findById: vi.fn(async (id: string) => inspectors[id] ?? null) };
  const createNotification = { execute: vi.fn().mockResolvedValue(undefined) };
  const logger = { warn: vi.fn() };

  const subscriber = new NotifyOnGroupInspectorChangeSubscriber(
    serviceGroupRepo as never,
    inspectorRepo as never,
    createNotification as never,
    logger,
  );

  const handlers: Record<string, (e: unknown) => Promise<void>> = {};
  subscriber.register({ subscribe: (type: string, h: never) => { handlers[type] = h; } } as never);

  return { handlers, serviceGroupRepo, inspectorRepo, createNotification, logger };
}

const CHANGED_EVENT = {
  type: SERVICE_GROUP_EVENTS.INSPECTOR_CHANGED,
  payload: { groupId: 'group-1', tenantId: 'tenant-1', inspectorId: 'insp-new', previousInspectorId: 'insp-old' },
  occurredAt: new Date(),
};

describe('NotifyOnGroupInspectorChangeSubscriber', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tells the incoming inspector they have the group', async () => {
    const { handlers, createNotification } = setup();

    await handlers[SERVICE_GROUP_EVENTS.INSPECTOR_CHANGED]!(CHANGED_EVENT);

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'new@example.com',
        channel: 'EMAIL',
        templateCode: 'INSPECTOR_GROUP_ASSIGNED',
        payloadJson: expect.objectContaining({ inspectorName: 'New Inspector', groupCode: '42', jobCount: '2' }),
      }),
    );
  });

  it('renders the date and window in the display format, not raw ISO', async () => {
    // These land directly in the inspector's email/SMS body ("scheduled for
    // {{scheduledDate}} at {{timeWindow}}"), so they must match what the rental
    // tenant sees — this surface was still sending '2026-06-01' / '09:00-12:00'.
    const { handlers, createNotification } = setup();

    await handlers[SERVICE_GROUP_EVENTS.INSPECTOR_CHANGED]!(CHANGED_EVENT);

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        payloadJson: expect.objectContaining({
          scheduledDate: '01/06/2026',
          timeWindow: '9:00 am – 12:00 pm',
        }),
      }),
    );
  });

  it('tells the outgoing inspector the group left their schedule', async () => {
    const { handlers, createNotification } = setup();

    await handlers[SERVICE_GROUP_EVENTS.INSPECTOR_CHANGED]!(CHANGED_EVENT);

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: 'old@example.com', templateCode: 'INSPECTOR_GROUP_UNASSIGNED' }),
    );
  });

  it('skips the outgoing notice on a first assignment', async () => {
    const { handlers, createNotification } = setup();

    await handlers[SERVICE_GROUP_EVENTS.INSPECTOR_CHANGED]!({
      ...CHANGED_EVENT,
      payload: { ...CHANGED_EVENT.payload, previousInspectorId: null },
    });

    const codes = createNotification.execute.mock.calls.map((c) => c[0].templateCode);
    expect(codes).toEqual(['INSPECTOR_GROUP_ASSIGNED']);
  });

  it('falls back to the first agency when the group spans several', async () => {
    const { handlers, createNotification } = setup({
      group: makeGroupResult({ primaryTenantId: null, tenantIds: ['tenant-a', 'tenant-b'] }),
    });

    await handlers[SERVICE_GROUP_EVENTS.INSPECTOR_CHANGED]!(CHANGED_EVENT);

    expect(createNotification.execute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a' }));
  });

  it('skips a group with no members rather than throwing on a blank tenant', async () => {
    const { handlers, createNotification, logger } = setup({
      group: makeGroupResult({ primaryTenantId: null, tenantIds: [], appointments: [] }),
    });

    await handlers[SERVICE_GROUP_EVENTS.INSPECTOR_CHANGED]!(CHANGED_EVENT);

    expect(createNotification.execute).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('still notifies the other inspector when one send fails', async () => {
    const { handlers, createNotification } = setup();
    createNotification.execute.mockRejectedValueOnce(new Error('smtp down'));

    await handlers[SERVICE_GROUP_EVENTS.INSPECTOR_CHANGED]!(CHANGED_EVENT);

    expect(createNotification.execute).toHaveBeenCalledTimes(2);
  });

  it('tells the assigned inspector when the group schedule moves', async () => {
    const { handlers, createNotification } = setup();

    await handlers[SERVICE_GROUP_EVENTS.SCHEDULE_CHANGED]!({
      type: SERVICE_GROUP_EVENTS.SCHEDULE_CHANGED,
      payload: {
        groupId: 'group-1',
        inspectorId: 'insp-new',
        previousScheduledDate: '2026-05-20',
        previousTimeWindow: '08:00-16:00',
      },
      occurredAt: new Date(),
    });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'new@example.com',
        templateCode: 'INSPECTOR_GROUP_RESCHEDULED',
        payloadJson: expect.objectContaining({
          // Formatted like the new values they sit beside in the message body.
          previousScheduledDate: '20/05/2026',
          previousTimeWindow: '8:00 am – 4:00 pm',
        }),
      }),
    );
  });

  it('sends nothing when an unassigned group is rescheduled', async () => {
    const { handlers, createNotification } = setup();

    await handlers[SERVICE_GROUP_EVENTS.SCHEDULE_CHANGED]!({
      type: SERVICE_GROUP_EVENTS.SCHEDULE_CHANGED,
      payload: { groupId: 'group-1', inspectorId: null },
      occurredAt: new Date(),
    });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });
});
