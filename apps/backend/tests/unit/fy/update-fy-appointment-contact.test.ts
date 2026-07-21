import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UpdateFyAppointmentContactUseCase } from '../../../src/modules/fy/application/use-cases/update-fy-appointment-contact.use-case';
import { AppointmentNotFoundError } from '../../../src/modules/appointment/domain/appointment.errors';
import { NotFoundError } from '../../../src/shared/domain/errors';

const actor = { userId: 'api-key:k-1', tenantId: null, role: 'OP', scopes: ['bot:fy'] } as any;
const auditService = { log: vi.fn() } as any;

function makeDeps(overrides: { contact?: unknown; emailConflict?: boolean } = {}) {
  const contact =
    overrides.contact === undefined
      ? {
          id: 'junction-1',
          contactId: 'registry-1',
          effectiveName: 'John Smith',
          effectiveEmail: 'old@x.com',
          effectivePhone: '0412345678',
        }
      : overrides.contact;
  const appointmentRepo = {
    findById: vi.fn(async () => ({
      appointment: { id: 'a1', tenantId: 't1' },
      contact,
    })),
    updateContactSnapshot: vi.fn(async () => {}),
  } as any;
  const contactRepo = {
    existsByEmail: vi.fn(async () => overrides.emailConflict ?? false),
    update: vi.fn(async () => {}),
  } as any;
  return { appointmentRepo, contactRepo };
}

beforeEach(() => vi.clearAllMocks());

describe('UpdateFyAppointmentContactUseCase', () => {
  it('updates snapshot + registry, normalising phone to E.164', async () => {
    const { appointmentRepo, contactRepo } = makeDeps();
    const useCase = new UpdateFyAppointmentContactUseCase(appointmentRepo, contactRepo, auditService);

    const result = await useCase.execute({
      appointmentId: 'a1',
      name: 'John A. Smith',
      phone: '0412 345 678',
      actor,
    });

    expect(appointmentRepo.updateContactSnapshot).toHaveBeenCalledWith('a1', 'junction-1', {
      snapshotName: 'John A. Smith',
      snapshotPhone: '+61412345678',
    });
    expect(contactRepo.update).toHaveBeenCalledWith('registry-1', 't1', {
      displayName: 'John A. Smith',
      primaryPhone: '+61412345678',
    });
    expect(result.contact).toEqual({
      name: 'John A. Smith',
      email: 'old@x.com',
      phone: '+61412345678',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'fy.contact_updated', actorId: 'api-key:k-1' }),
    );
  });

  it('skips the registry silently on email conflict (audited)', async () => {
    const { appointmentRepo, contactRepo } = makeDeps({ emailConflict: true });
    const useCase = new UpdateFyAppointmentContactUseCase(appointmentRepo, contactRepo, auditService);

    await useCase.execute({ appointmentId: 'a1', email: 'taken@x.com', actor });

    expect(appointmentRepo.updateContactSnapshot).toHaveBeenCalled();
    expect(contactRepo.update).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'contact.fy_update_skipped_conflict' }),
    );
  });

  it('404s for unknown appointment and for appointment without contact', async () => {
    const noAppointment = new UpdateFyAppointmentContactUseCase(
      { findById: vi.fn(async () => null) } as any,
      makeDeps().contactRepo,
      auditService,
    );
    await expect(
      noAppointment.execute({ appointmentId: 'x', name: 'a', actor }),
    ).rejects.toBeInstanceOf(AppointmentNotFoundError);

    const { appointmentRepo, contactRepo } = makeDeps({ contact: null });
    const noContact = new UpdateFyAppointmentContactUseCase(appointmentRepo, contactRepo, auditService);
    await expect(noContact.execute({ appointmentId: 'a1', name: 'a', actor })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
