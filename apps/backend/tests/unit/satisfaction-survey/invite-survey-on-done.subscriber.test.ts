import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteSurveyOnDoneSubscriber } from '../../../src/modules/satisfaction-survey/application/subscribers/invite-survey-on-done.subscriber';
import { APPOINTMENT_EVENTS } from '../../../src/shared/application/events/domain-event-bus';

const TOKEN_CREATED_AT = new Date('2026-07-20T00:00:00.000Z');

function makeToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'token-1',
    appointmentId: 'appointment-1',
    status: 'EXPIRED',
    expiresAt: new Date('2026-08-03T13:00:00.000Z'),
    rawTokenEncrypted: 'encrypted-token',
    createdAt: TOKEN_CREATED_AT,
    ...overrides,
  };
}

function makeAppointmentResult(overrides: Record<string, unknown> = {}) {
  return {
    appointment: {
      id: 'appointment-1',
      tenantId: 'tenant-1',
      inspectorId: 'inspector-1',
      status: 'DONE',
    },
    contact: { effectiveEmail: 'tenant@example.com', effectiveName: 'John Smith' },
    contacts: [],
    restrictions: [],
    propertyAddress: '12 Smith St, Bondi',
    inspectorName: 'James Roberts',
    serviceTypeName: 'Routine Inspection',
    ...overrides,
  };
}

function doneEvent(payload: Record<string, unknown> = {}) {
  return {
    type: APPOINTMENT_EVENTS.STATUS_TRANSITION,
    payload: {
      appointmentId: 'appointment-1',
      tenantId: 'tenant-1',
      fromStatus: 'SCHEDULED',
      toStatus: 'DONE',
      ...payload,
    },
    occurredAt: new Date('2026-08-03T12:00:00.000Z'),
  };
}

describe('InviteSurveyOnDoneSubscriber', () => {
  const appointmentRepo = { findById: vi.fn() };
  const tokenRepo = {
    findLatestExtendableByAppointmentId: vi.fn(),
    extendExpiryAndReactivate: vi.fn(),
  };
  const surveyRepo = { findByAppointmentId: vi.fn() };
  const notificationRepo = { existsByAppointmentAndTemplate: vi.fn() };
  const tenantRepo = { findById: vi.fn() };
  const tokenEncrypter = { decrypt: vi.fn(), encrypt: vi.fn() };
  const createNotification = { execute: vi.fn() };
  const buildNotificationPayload = { build: vi.fn().mockReturnValue({ surveyLink: 'https://x/portal/raw' }) };
  const mintPortalTokenService = { mint: vi.fn() };
  const appointmentCodeFormatter = { format: vi.fn() };
  const logger = { warn: vi.fn(), info: vi.fn() };

  function makeSubscriber() {
    return new InviteSurveyOnDoneSubscriber(
      appointmentRepo as never,
      tokenRepo as never,
      surveyRepo as never,
      notificationRepo as never,
      tenantRepo as never,
      tokenEncrypter as never,
      buildNotificationPayload as never,
      appointmentCodeFormatter as never,
      createNotification as never,
      'https://app.properfy.me',
      logger,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    appointmentRepo.findById.mockResolvedValue(makeAppointmentResult());
    tokenRepo.findLatestExtendableByAppointmentId.mockResolvedValue(makeToken());
    tokenRepo.extendExpiryAndReactivate.mockResolvedValue(true);
    surveyRepo.findByAppointmentId.mockResolvedValue(null);
    notificationRepo.existsByAppointmentAndTemplate.mockResolvedValue(false);
    tenantRepo.findById.mockResolvedValue({ id: 'tenant-1', name: 'ABC Realty', settingsJson: {} });
    tokenEncrypter.decrypt.mockReturnValue('raw-token');
    buildNotificationPayload.build.mockReturnValue({ surveyLink: 'https://x/portal/raw' });
  });

  it('extends the token and sends the invite when the inspection completes', async () => {
    await makeSubscriber().handle(doneEvent());

    expect(tokenRepo.extendExpiryAndReactivate).toHaveBeenCalledWith(
      'token-1',
      'appointment-1',
      expect.any(Date),
    );
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'INSPECTION_SATISFACTION_SURVEY',
        channel: 'EMAIL',
        recipient: 'tenant@example.com',
        appointmentId: 'appointment-1',
        tenantId: 'tenant-1',
      }),
    );
  });

  it('extends the deadline to 14 days past completion', async () => {
    await makeSubscriber().handle(doneEvent());

    const [, , notBefore] = tokenRepo.extendExpiryAndReactivate.mock.calls[0];
    const days = (notBefore.getTime() - new Date('2026-08-03T12:00:00.000Z').getTime()) / 86400000;
    expect(days).toBeCloseTo(14, 1);
  });

  it('extends before it notifies', async () => {
    // Order matters: a link that arrives before the token is revived would land
    // the tenant on an expired portal.
    const order: string[] = [];
    tokenRepo.extendExpiryAndReactivate.mockImplementation(async () => {
      order.push('extend');
      return true;
    });
    createNotification.execute.mockImplementation(async () => {
      order.push('notify');
      return { notificationId: 'n1' };
    });

    await makeSubscriber().handle(doneEvent());

    expect(order).toEqual(['extend', 'notify']);
  });

  it('never mints a new token', async () => {
    // Minting revokes the live link the tenant already holds — the whole reason
    // this path extends instead.
    await makeSubscriber().handle(doneEvent());

    expect(mintPortalTokenService.mint).not.toHaveBeenCalled();
  });

  it('ignores transitions to any other status', async () => {
    await makeSubscriber().handle(doneEvent({ toStatus: 'CANCELLED' }));

    expect(appointmentRepo.findById).not.toHaveBeenCalled();
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('does nothing when the appointment never had a portal token', async () => {
    tokenRepo.findLatestExtendableByAppointmentId.mockResolvedValue(null);

    await makeSubscriber().handle(doneEvent());

    expect(tokenRepo.extendExpiryAndReactivate).not.toHaveBeenCalled();
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('still extends the token when there is no email to notify', async () => {
    // The tenant may open the link they already have even if we cannot email
    // them, so the extension is worth doing on its own.
    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentResult({ contact: { effectiveEmail: null, effectiveName: 'John' } }),
    );

    await makeSubscriber().handle(doneEvent());

    expect(tokenRepo.extendExpiryAndReactivate).toHaveBeenCalled();
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('skips an appointment with no inspector to rate', async () => {
    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentResult({ appointment: { id: 'appointment-1', tenantId: 'tenant-1', inspectorId: null, status: 'DONE' } }),
    );

    await makeSubscriber().handle(doneEvent());

    expect(tokenRepo.extendExpiryAndReactivate).not.toHaveBeenCalled();
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('does not ask again once the tenant has answered', async () => {
    surveyRepo.findByAppointmentId.mockResolvedValue({ id: 'survey-1', rating: 5 });

    await makeSubscriber().handle(doneEvent());

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('does not extend the portal window once the tenant has answered', async () => {
    // The window exists to let them answer. Pushing it out after they already
    // did prolongs access to a link whose purpose is spent.
    surveyRepo.findByAppointmentId.mockResolvedValue({ id: 'survey-1', rating: 5 });

    await makeSubscriber().handle(doneEvent());

    expect(tokenRepo.extendExpiryAndReactivate).not.toHaveBeenCalled();
  });

  it('does not re-extend the portal window on a repeated DONE', async () => {
    // DONE -> DRAFT -> DONE is a legitimate operator path. Extending on every
    // repeat would silently grant another 14 days of portal access each time,
    // while sending nothing.
    notificationRepo.existsByAppointmentAndTemplate.mockResolvedValue(true);

    await makeSubscriber().handle(doneEvent());

    expect(tokenRepo.extendExpiryAndReactivate).not.toHaveBeenCalled();
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('does not send a second invite for the same appointment', async () => {
    // Lifetime dedupe: the survey is asked once per inspection, so a DONE →
    // DRAFT → DONE loop must not re-ask.
    notificationRepo.existsByAppointmentAndTemplate.mockResolvedValue(true);

    await makeSubscriber().handle(doneEvent());

    expect(notificationRepo.existsByAppointmentAndTemplate).toHaveBeenCalledWith(
      'appointment-1',
      'INSPECTION_SATISFACTION_SURVEY',
      'tenant-1',
    );
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('sends exactly one invite across a repeated DONE transition', async () => {
    const subscriber = makeSubscriber();
    await subscriber.handle(doneEvent());
    notificationRepo.existsByAppointmentAndTemplate.mockResolvedValue(true);
    await subscriber.handle(doneEvent());

    expect(createNotification.execute).toHaveBeenCalledTimes(1);
  });

  it('skips the invite when the raw token cannot be recovered', async () => {
    tokenRepo.findLatestExtendableByAppointmentId.mockResolvedValue(
      makeToken({ rawTokenEncrypted: null }),
    );

    await makeSubscriber().handle(doneEvent());

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('skips the invite when decryption throws, without failing the transition', async () => {
    tokenEncrypter.decrypt.mockImplementation(() => {
      throw new Error('bad key');
    });

    await expect(makeSubscriber().handle(doneEvent())).resolves.toBeUndefined();
    expect(createNotification.execute).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('swallows a notification failure so the transition is never affected', async () => {
    createNotification.execute.mockRejectedValue(new Error('smtp down'));

    await expect(makeSubscriber().handle(doneEvent())).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not notify when the token could not actually be extended', async () => {
    // Raced by the expiry worker or revoked in between: sending a link that no
    // longer opens is worse than sending nothing.
    tokenRepo.extendExpiryAndReactivate.mockResolvedValue(false);

    await makeSubscriber().handle(doneEvent());

    expect(createNotification.execute).not.toHaveBeenCalled();
  });
});
