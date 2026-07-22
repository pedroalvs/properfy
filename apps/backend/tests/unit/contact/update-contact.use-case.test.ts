import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateContactUseCase } from '../../../src/modules/contact/application/use-cases/update-contact.use-case';
import {
  ContactNotFoundError,
  ContactEmailAlreadyExistsError,
  ContactPhoneAlreadyExistsError,
  ContactNoChannelError,
} from '../../../src/modules/contact/domain/contact.errors';

const contactRepo = {
  findById: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  existsByEmail: vi.fn(),
  existsByPhone: vi.fn(),
  findManyActiveByEmailsOrPhones: vi.fn().mockResolvedValue([]),
  searchByTrigram: vi.fn(),
  linkToAppointment: vi.fn(),
  updateContactSnapshot: vi.fn(),
};

const auditService = { log: vi.fn() };

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONTACT_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ACTOR_ID = 'user-1';

function makeExistingContact(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT_ID,
    tenantId: TENANT_ID,
    type: 'RENTAL_TENANT',
    displayName: 'Alice Smith',
    company: null,
    primaryEmail: 'alice@example.com',
    primaryPhone: null,
    additionalChannels: [],
    notes: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSut() {
  return new UpdateContactUseCase(contactRepo as any, auditService as any);
}

describe('UpdateContactUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contactRepo.findById.mockResolvedValue(makeExistingContact());
    contactRepo.update.mockResolvedValue(undefined);
    contactRepo.existsByEmail.mockResolvedValue(false);
    contactRepo.existsByPhone.mockResolvedValue(false);
  });

  it('updates display name and returns the refreshed entity', async () => {
    const updated = makeExistingContact({ displayName: 'Alice Jones' });
    contactRepo.findById
      .mockResolvedValueOnce(makeExistingContact())
      .mockResolvedValueOnce(updated);

    const sut = makeSut();
    const result = await sut.execute({
      contactId: CONTACT_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      data: { displayName: 'Alice Jones' },
    });

    // Review fix — Issue 1: the update SQL is unscoped (`tenantId = null`)
    // so a CL_ADMIN editing a standalone or cross-tenant contact actually
    // mutates the row. Visibility is gated upstream via ownsContact /
    // existsLinkedToTenant, not at the row level.
    expect(contactRepo.update).toHaveBeenCalledWith(
      CONTACT_ID,
      null,
      expect.objectContaining({ displayName: 'Alice Jones' }),
    );
    expect(result?.displayName).toBe('Alice Jones');
  });

  it('throws ContactNotFoundError when contact does not exist', async () => {
    contactRepo.findById.mockResolvedValue(null);
    const sut = makeSut();

    await expect(
      sut.execute({ contactId: 'missing', tenantId: TENANT_ID, actorId: ACTOR_ID, data: {} }),
    ).rejects.toThrow(ContactNotFoundError);

    expect(contactRepo.update).not.toHaveBeenCalled();
  });

  it('throws ContactNoChannelError when patch would remove all channels', async () => {
    // Existing: email only. Patch sets email to null, no phone.
    const sut = makeSut();

    await expect(
      sut.execute({
        contactId: CONTACT_ID,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        data: { primaryEmail: null, primaryPhone: null },
      }),
    ).rejects.toThrow(ContactNoChannelError);
  });

  it('throws ContactEmailAlreadyExistsError when new email is taken by another contact', async () => {
    contactRepo.existsByEmail.mockResolvedValue(true);
    const sut = makeSut();

    await expect(
      sut.execute({
        contactId: CONTACT_ID,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        data: { primaryEmail: 'taken@example.com' },
      }),
    ).rejects.toThrow(ContactEmailAlreadyExistsError);
  });

  it('does not run email uniqueness check when email is unchanged', async () => {
    // Same email as existing — no duplicate check needed
    const sut = makeSut();
    await sut.execute({
      contactId: CONTACT_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      data: { primaryEmail: 'alice@example.com' }, // same as existing
    });

    expect(contactRepo.existsByEmail).not.toHaveBeenCalled();
  });

  it('throws ContactPhoneAlreadyExistsError when new phone is taken', async () => {
    contactRepo.existsByPhone.mockResolvedValue(true);
    const sut = makeSut();

    await expect(
      sut.execute({
        contactId: CONTACT_ID,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        data: { primaryPhone: '+61400000099' },
      }),
    ).rejects.toThrow(ContactPhoneAlreadyExistsError);
  });

  it('emits audit action contact.deactivated when isActive switches false', async () => {
    const sut = makeSut();
    await sut.execute({
      contactId: CONTACT_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      data: { isActive: false },
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'contact.deactivated' }),
    );
  });

  it('emits audit action contact.reactivated when isActive switches true on inactive contact', async () => {
    contactRepo.findById.mockResolvedValue(makeExistingContact({ isActive: false }));
    const sut = makeSut();
    await sut.execute({
      contactId: CONTACT_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      data: { isActive: true },
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'contact.reactivated' }),
    );
  });

  it('emits audit action contact.updated for regular field changes', async () => {
    const sut = makeSut();
    await sut.execute({
      contactId: CONTACT_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      data: { displayName: 'Alice New Name' },
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'contact.updated' }),
    );
  });

  it('includes before/after snapshots in audit entry', async () => {
    const sut = makeSut();
    await sut.execute({
      contactId: CONTACT_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      data: { displayName: 'Alice New Name' },
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        before: expect.objectContaining({
          displayName: 'Alice Smith',
          primaryEmail: 'alice@example.com',
        }),
        after: expect.objectContaining({
          displayName: 'Alice New Name',
        }),
      }),
    );
  });
});
