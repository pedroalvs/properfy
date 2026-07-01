import { describe, expect, it, vi } from 'vitest';
import { GenerateInvoiceUseCase } from './generate-invoice.use-case';

const INSPECTOR_ID = 'insp-1';
const PERIOD_START = '2026-01-01';
const PERIOD_END = '2026-01-14';
const USER_ID = 'user-am-1';

function makeAuthorizationService(throws = false) {
  return {
    assertRoles: vi.fn().mockImplementation(() => {
      if (throws) {
        throw new Error('FORBIDDEN: role not permitted');
      }
    }),
  };
}

function makeInvoiceRepo(existingInvoice: unknown = null, overlapping: unknown = null) {
  return {
    findByInspectorAndPeriod: vi.fn().mockResolvedValue(existingInvoice),
    findOverlapping: vi.fn().mockResolvedValue(overlapping),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFinancialEntryRepo() {
  return {
    sumApprovedPayoutsForInspectorInPeriod: vi.fn().mockResolvedValue(200),
  };
}

function makeAuditService() {
  return { log: vi.fn() };
}

const baseInput = {
  inspectorId: INSPECTOR_ID,
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  actor: {
    userId: USER_ID,
    tenantId: null,
    role: 'AM' as const,
    email: 'admin@example.com',
    branchId: null,
    inspectorId: null,
  },
};

describe('GenerateInvoiceUseCase', () => {
  it('always calls assertRoles unconditionally, even for a valid actor', async () => {
    const authorizationService = makeAuthorizationService();
    const invoiceRepo = makeInvoiceRepo();
    const financialEntryRepo = makeFinancialEntryRepo();
    const auditService = makeAuditService();

    const useCase = new GenerateInvoiceUseCase(
      invoiceRepo as any,
      financialEntryRepo as any,
      auditService as any,
      authorizationService as any,
    );

    await useCase.execute(baseInput);

    expect(authorizationService.assertRoles).toHaveBeenCalledOnce();
    expect(authorizationService.assertRoles).toHaveBeenCalledWith(
      baseInput.actor,
      ['AM', 'OP'],
      { action: 'financial.generate_invoice', entityType: 'InspectorInvoice' },
    );
  });

  it('propagates the error when assertRoles throws (non-AM/OP actor)', async () => {
    const authorizationService = makeAuthorizationService(true);
    const invoiceRepo = makeInvoiceRepo();
    const financialEntryRepo = makeFinancialEntryRepo();
    const auditService = makeAuditService();

    const useCase = new GenerateInvoiceUseCase(
      invoiceRepo as any,
      financialEntryRepo as any,
      auditService as any,
      authorizationService as any,
    );

    await expect(useCase.execute(baseInput)).rejects.toThrow('FORBIDDEN: role not permitted');
    expect(authorizationService.assertRoles).toHaveBeenCalledOnce();
    expect(invoiceRepo.findByInspectorAndPeriod).not.toHaveBeenCalled();
  });
});
