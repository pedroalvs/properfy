import { describe, it, expect, vi } from 'vitest';
import {
  NotifyInspectorUnableService,
  INSPECTOR_UNABLE_ALERT_PAYLOAD_KEYS,
} from './notify-inspector-unable.service';

function build(recipients: Array<{ email: string }> = [{ email: 'op@properfy.me' }, { email: 'am@properfy.me' }]) {
  const userManagementRepo = {
    findActiveByRoles: vi.fn().mockResolvedValue(recipients),
  };
  const createNotificationUseCase = { execute: vi.fn().mockResolvedValue(undefined) };
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const service = new NotifyInspectorUnableService(
    userManagementRepo as never,
    createNotificationUseCase as never,
    logger as never,
  );
  return { service, userManagementRepo, createNotificationUseCase, logger };
}

const input = {
  appointmentId: 'apt-1',
  tenantId: 'tenant-1',
  inspectorName: 'Jane Doe',
  reasonCode: 'KEY_FAILED',
  note: 'Lockbox code wrong',
  occurredAt: new Date('2026-11-03T09:41:12.000Z'),
};

describe('NotifyInspectorUnableService', () => {
  it('emails every active OP/AM with the INSPECTOR_UNABLE_ALERT template', async () => {
    const ctx = build();
    await ctx.service.notify(input);

    expect(ctx.userManagementRepo.findActiveByRoles).toHaveBeenCalledWith(['OP', 'AM']);
    expect(ctx.createNotificationUseCase.execute).toHaveBeenCalledTimes(2);
    expect(ctx.createNotificationUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        appointmentId: 'apt-1',
        recipient: 'op@properfy.me',
        channel: 'EMAIL',
        templateCode: 'INSPECTOR_UNABLE_ALERT',
      }),
    );
  });

  it('builds the payload with exactly the declared keys, humanizing the reason', async () => {
    const ctx = build();
    await ctx.service.notify(input);
    const { payloadJson } = ctx.createNotificationUseCase.execute.mock.calls[0]![0];
    expect(Object.keys(payloadJson).sort()).toEqual([...INSPECTOR_UNABLE_ALERT_PAYLOAD_KEYS].sort());
    expect(payloadJson).toMatchObject({
      appointmentId: 'apt-1',
      inspectorName: 'Jane Doe',
      fieldIssueReason: "Key didn't work",
      fieldIssueNote: 'Lockbox code wrong',
    });
  });

  it('sends an empty note and a fallback inspector name when absent', async () => {
    const ctx = build();
    await ctx.service.notify({ ...input, note: null, inspectorName: null });
    const { payloadJson } = ctx.createNotificationUseCase.execute.mock.calls[0]![0];
    expect(payloadJson.fieldIssueNote).toBe('');
    expect(payloadJson.inspectorName).toBe('An inspector');
  });

  it('falls back to the raw reason code when it has no label', async () => {
    const ctx = build();
    await ctx.service.notify({ ...input, reasonCode: 'FUTURE_CODE' });
    const { payloadJson } = ctx.createNotificationUseCase.execute.mock.calls[0]![0];
    expect(payloadJson.fieldIssueReason).toBe('FUTURE_CODE');
  });

  it('logs and does not throw when no active OP/AM exist', async () => {
    const ctx = build([]);
    await expect(ctx.service.notify(input)).resolves.toBeUndefined();
    expect(ctx.createNotificationUseCase.execute).not.toHaveBeenCalled();
    expect(ctx.logger.error).toHaveBeenCalledWith(
      expect.anything(),
      'No active OP/AM users to receive inspector unable alerts',
    );
  });

  it('logs a per-recipient failure without throwing', async () => {
    const ctx = build();
    ctx.createNotificationUseCase.execute
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce(undefined);
    await expect(ctx.service.notify(input)).resolves.toBeUndefined();
    expect(ctx.logger.error).toHaveBeenCalled();
  });
});
