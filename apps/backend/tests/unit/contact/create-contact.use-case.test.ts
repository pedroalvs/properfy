import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateContactUseCase } from '../../../src/modules/contact/application/use-cases/create-contact.use-case';
import {
  ContactNoChannelError,
  ContactEmailAlreadyExistsError,
  ContactPhoneAlreadyExistsError,
  ContactChannelDuplicatedError,
} from '../../../src/modules/contact/domain/contact.errors';

const contactRepo = {
  findById: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  existsByEmail: vi.fn(),
  existsByPhone: vi.fn(),
  findActiveByEmailOrPhone: vi.fn(),
  searchByTrigram: vi.fn(),
  linkToAppointment: vi.fn(),
  updateContactSnapshot: vi.fn(),
};

const auditService = { log: vi.fn() };

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const ACTOR_ID = 'user-1';

function makeSut() {
  return new CreateContactUseCase(contactRepo as any, auditService as any);
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT_ID,
    type: 'TENANT' as const,
    displayName: 'Alice Smith',
    primaryEmail: 'alice@example.com',
    primaryPhone: null,
    additionalChannels: [],
    actorId: ACTOR_ID,
    ...overrides,
  };
}

describe('CreateContactUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contactRepo.existsByEmail.mockResolvedValue(false);
    contactRepo.existsByPhone.mockResolvedValue(false);
    contactRepo.save.mockResolvedValue(undefined);
  });

  it('creates contact and returns entity (happy path — email only)', async () => {
    const sut = makeSut();
    const result = await sut.execute(baseInput());

    expect(contactRepo.save).toHaveBeenCalledOnce();
    expect(result.tenantId).toBe(TENANT_ID);
    expect(result.displayName).toBe('Alice Smith');
    expect(result.primaryEmail).toBe('alice@example.com');
    expect(result.isActive).toBe(true);
  });

  it('creates contact with phone only (no email)', async () => {
    const sut = makeSut();
    const result = await sut.execute(
      baseInput({ primaryEmail: null, primaryPhone: '+61400000001' }),
    );

    expect(result.primaryPhone).toBe('+61400000001');
    expect(contactRepo.existsByPhone).toHaveBeenCalledWith(TENANT_ID, '+61400000001');
    expect(contactRepo.existsByEmail).not.toHaveBeenCalled();
  });

  it('logs audit entry with correct after-snapshot', async () => {
    const sut = makeSut();
    await sut.execute(baseInput());

    expect(auditService.log).toHaveBeenCalledOnce();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'contact.created',
        actorType: 'USER',
        actorId: ACTOR_ID,
        entityType: 'contact',
        tenantId: TENANT_ID,
        after: expect.objectContaining({
          type: 'TENANT',
          displayName: 'Alice Smith',
          primaryEmail: 'alice@example.com',
        }),
      }),
    );
  });

  it('throws ContactNoChannelError when neither email nor phone provided', async () => {
    const sut = makeSut();

    await expect(
      sut.execute(baseInput({ primaryEmail: null, primaryPhone: null })),
    ).rejects.toThrow(ContactNoChannelError);

    expect(contactRepo.save).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('throws ContactChannelDuplicatedError when additionalChannel duplicates primaryEmail', async () => {
    const sut = makeSut();

    await expect(
      sut.execute(
        baseInput({
          additionalChannels: [{ channel: 'EMAIL', value: 'alice@example.com', label: 'Work' }],
        }),
      ),
    ).rejects.toThrow(ContactChannelDuplicatedError);
  });

  it('throws ContactEmailAlreadyExistsError when email is taken in tenant', async () => {
    contactRepo.existsByEmail.mockResolvedValue(true);
    const sut = makeSut();

    await expect(sut.execute(baseInput())).rejects.toThrow(ContactEmailAlreadyExistsError);

    expect(contactRepo.save).not.toHaveBeenCalled();
  });

  it('throws ContactPhoneAlreadyExistsError when phone is taken in tenant', async () => {
    contactRepo.existsByPhone.mockResolvedValue(true);
    const sut = makeSut();

    await expect(
      sut.execute(baseInput({ primaryEmail: null, primaryPhone: '+61400000099' })),
    ).rejects.toThrow(ContactPhoneAlreadyExistsError);

    expect(contactRepo.save).not.toHaveBeenCalled();
  });

  it('checks both email and phone uniqueness when both are provided', async () => {
    const sut = makeSut();
    await sut.execute(baseInput({ primaryPhone: '+61400000001' }));

    expect(contactRepo.existsByEmail).toHaveBeenCalledWith(TENANT_ID, 'alice@example.com');
    expect(contactRepo.existsByPhone).toHaveBeenCalledWith(TENANT_ID, '+61400000001');
  });

  it('does not run uniqueness checks for fields not provided', async () => {
    const sut = makeSut();
    await sut.execute(baseInput({ primaryEmail: 'alice@example.com', primaryPhone: null }));

    expect(contactRepo.existsByEmail).toHaveBeenCalledOnce();
    expect(contactRepo.existsByPhone).not.toHaveBeenCalled();
  });
});
