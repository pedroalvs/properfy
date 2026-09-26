import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateInspectorAvailabilityTemplateUseCase } from '../update-inspector-availability-template.use-case';
import type { RegenerateInspectorAvailabilitySlotsUseCase } from '../regenerate-inspector-availability-slots.use-case';
import type { AvailabilityTemplate } from '@properfy/shared';

const INSPECTOR_ID = 'insp-1';
const ACTOR_ID = 'user-1';

const template: AvailabilityTemplate = {
  mon: { am: true, pm: false },
  tue: { am: false, pm: false },
  wed: { am: false, pm: false },
  thu: { am: false, pm: false },
  fri: { am: false, pm: false },
  sat: { am: false, pm: false },
  sun: { am: false, pm: false },
};

/** Sentinel tx object $transaction hands to the callback. */
const FAKE_TX = { __tx: true };

describe('UpdateInspectorAvailabilityTemplateUseCase — atomic persist + regen', () => {
  let inspectorRepo: {
    findById: ReturnType<typeof vi.fn>;
    getAvailabilityTemplate: ReturnType<typeof vi.fn>;
    updateAvailabilityTemplate: ReturnType<typeof vi.fn>;
  };
  let slotRepo: { findSlotsForRegeneration: ReturnType<typeof vi.fn> };
  let regenerator: { execute: ReturnType<typeof vi.fn> };
  let auditService: { log: ReturnType<typeof vi.fn> };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    inspectorRepo = {
      findById: vi.fn().mockResolvedValue({ id: INSPECTOR_ID }),
      getAvailabilityTemplate: vi.fn().mockResolvedValue(template),
      updateAvailabilityTemplate: vi.fn().mockResolvedValue(undefined),
    };
    slotRepo = { findSlotsForRegeneration: vi.fn().mockResolvedValue([]) };
    regenerator = {
      execute: vi.fn().mockResolvedValue({ slotsCreated: 0, slotsDeleted: 0, slotsPreserved: 0 }),
    };
    auditService = { log: vi.fn() };
    // Fake $transaction: invoke the callback with a sentinel tx, like Prisma does.
    prisma = { $transaction: vi.fn() };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(FAKE_TX));
  });

  function makeSut(): UpdateInspectorAvailabilityTemplateUseCase {
    return new UpdateInspectorAvailabilityTemplateUseCase(
      inspectorRepo as never,
      slotRepo as never,
      prisma as never,
      regenerator as unknown as RegenerateInspectorAvailabilitySlotsUseCase,
      auditService as never,
    );
  }

  it('runs the template write and slot regeneration inside a single transaction', async () => {
    await makeSut().execute({ inspectorId: INSPECTOR_ID, template, actorId: ACTOR_ID });

    // Exactly one transaction wraps the whole mutating sequence.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // The template write and the regeneration both receive the SAME tx handle.
    expect(inspectorRepo.updateAvailabilityTemplate).toHaveBeenCalledWith(
      INSPECTOR_ID,
      template,
      FAKE_TX,
    );
    expect(regenerator.execute).toHaveBeenCalledWith(
      { inspectorId: INSPECTOR_ID, template },
      FAKE_TX,
    );
    // Audit logs only after the transaction commits.
    expect(auditService.log).toHaveBeenCalledTimes(1);
  });

  it('rolls back atomically: a regenerator failure rejects and never audits', async () => {
    regenerator.execute.mockRejectedValue(new Error('regen boom'));

    await expect(
      makeSut().execute({ inspectorId: INSPECTOR_ID, template, actorId: ACTOR_ID }),
    ).rejects.toThrow('regen boom');

    // The template write was attempted inside the same transaction (so Prisma rolls it back)...
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(inspectorRepo.updateAvailabilityTemplate).toHaveBeenCalledWith(
      INSPECTOR_ID,
      template,
      FAKE_TX,
    );
    // ...and no side effect (audit) leaked out after the failed transaction.
    expect(auditService.log).not.toHaveBeenCalled();
  });
});
