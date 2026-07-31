import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetPortalLinkUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/get-portal-link.use-case';
import { AppointmentNotFoundError } from '../../../src/modules/appointment/domain/appointment.errors';
import { PortalTokenNotDecryptableError } from '../../../src/modules/appointment/domain/confirmation-cycle.errors';
import { NoActivePortalTokenError } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal.errors';

const BASE_URL = 'https://app.properfy.com.au';
const APPOINTMENT_ID = 'a0000000-0000-4000-8000-000000000001';
const RAW_TOKEN = 'kR7mQ2xLp9';
const EXPIRES_AT = new Date('2026-08-01T00:00:00.000Z');

const OP_ACTOR = { userId: 'user-1', tenantId: 'tenant-1', role: 'OP', email: 'op@properfy.com' } as never;

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    appointmentRepo: {
      findById: vi.fn().mockResolvedValue({ appointment: { id: APPOINTMENT_ID, tenantId: 'tenant-1' } }),
    },
    tokenRepo: {
      findActiveByAppointmentId: vi.fn().mockResolvedValue({
        id: 'token-1',
        expiresAt: EXPIRES_AT,
        rawTokenEncrypted: 'ciphertext',
      }),
    },
    tokenEncrypter: { decrypt: vi.fn().mockReturnValue(RAW_TOKEN), encrypt: vi.fn() },
    authorizationService: { assertRoles: vi.fn() },
    auditService: { log: vi.fn() },
    ...overrides,
  };
}

function makeUseCase(deps: ReturnType<typeof makeDeps>) {
  return new GetPortalLinkUseCase(
    deps.appointmentRepo as never,
    deps.tokenRepo as never,
    deps.tokenEncrypter as never,
    BASE_URL,
    deps.authorizationService as never,
    deps.auditService as never,
  );
}

describe('GetPortalLinkUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The operator copies this link and sends it to the rental tenant by hand, so it
  // has to be as short as the one the notification templates build. It used to emit
  // the long `/rental-tenant-portal/` prefix while every other builder already used
  // `/portal/`.
  it('builds the link on the short /portal/ path', async () => {
    const useCase = makeUseCase(makeDeps());

    const result = await useCase.execute({ appointmentId: APPOINTMENT_ID, actor: OP_ACTOR });

    expect(result.portalUrl).toBe(`${BASE_URL}/portal/${RAW_TOKEN}`);
    expect(result.expiresAt).toBe(EXPIRES_AT.toISOString());
  });

  it('restricts the action to AM and OP', async () => {
    const deps = makeDeps();
    await makeUseCase(deps).execute({ appointmentId: APPOINTMENT_ID, actor: OP_ACTOR });

    expect(deps.authorizationService.assertRoles).toHaveBeenCalledWith(
      OP_ACTOR,
      ['AM', 'OP'],
      expect.objectContaining({ action: 'appointment.portal_link' }),
    );
  });

  it('audits the copy so the link leaving the platform is traceable', async () => {
    const deps = makeDeps();
    await makeUseCase(deps).execute({ appointmentId: APPOINTMENT_ID, actor: OP_ACTOR });

    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rental_tenant_portal.link_copied',
        entityId: APPOINTMENT_ID,
        tenantId: 'tenant-1',
      }),
    );
  });

  it('throws AppointmentNotFoundError when the appointment is out of scope', async () => {
    const deps = makeDeps({ appointmentRepo: { findById: vi.fn().mockResolvedValue(null) } });

    await expect(
      makeUseCase(deps).execute({ appointmentId: APPOINTMENT_ID, actor: OP_ACTOR }),
    ).rejects.toThrow(AppointmentNotFoundError);
  });

  it('throws NoActivePortalTokenError when no token is active', async () => {
    const deps = makeDeps({
      tokenRepo: { findActiveByAppointmentId: vi.fn().mockResolvedValue(null) },
    });

    await expect(
      makeUseCase(deps).execute({ appointmentId: APPOINTMENT_ID, actor: OP_ACTOR }),
    ).rejects.toThrow(NoActivePortalTokenError);
  });

  it('throws PortalTokenNotDecryptableError when the stored ciphertext will not decrypt', async () => {
    const deps = makeDeps({
      tokenEncrypter: {
        decrypt: vi.fn(() => {
          throw new Error('bad key');
        }),
        encrypt: vi.fn(),
      },
    });

    await expect(
      makeUseCase(deps).execute({ appointmentId: APPOINTMENT_ID, actor: OP_ACTOR }),
    ).rejects.toThrow(PortalTokenNotDecryptableError);
  });
});
