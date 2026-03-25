import { describe, expect, it, vi } from 'vitest';
import { DownloadInvoiceUseCase } from './download-invoice.use-case';
import { InvoiceNotFoundError } from '../../domain/billing.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';

describe('DownloadInvoiceUseCase', () => {
  it('generates a presigned URL from the stored file key', async () => {
    const invoiceRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'inv-1',
        inspectorId: 'insp-1',
        fileKey: 'invoices/insp-1/inv-1.xlsx',
        isReady: () => true,
        hasFile: () => true,
      }),
    };
    const storageService = {
      generatePresignedGetUrl: vi.fn().mockResolvedValue('https://signed.example/invoice'),
    };

    const useCase = new DownloadInvoiceUseCase(
      invoiceRepo as any,
      storageService as any,
    );

    const result = await useCase.execute({
      invoiceId: 'inv-1',
      actor: {
        userId: 'user-1',
        tenantId: null,
        role: 'OP',
        email: 'op@test.com',
      } as any,
    });

    expect(storageService.generatePresignedGetUrl).toHaveBeenCalledWith(
      'invoices/insp-1/inv-1.xlsx',
      expect.any(Number),
    );
    expect(result.downloadUrl).toBe('https://signed.example/invoice');
    expect(new Date(result.expiresAt).toString()).not.toBe('Invalid Date');
  });

  it('blocks inspectors from downloading another inspector invoice', async () => {
    const invoiceRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'inv-1',
        inspectorId: 'insp-owner',
        fileKey: 'invoices/insp-owner/inv-1.xlsx',
        isReady: () => true,
        hasFile: () => true,
      }),
    };
    const storageService = {
      generatePresignedGetUrl: vi.fn(),
    };

    const useCase = new DownloadInvoiceUseCase(
      invoiceRepo as any,
      storageService as any,
    );

    await expect(
      useCase.execute({
        invoiceId: 'inv-1',
        actor: {
          userId: 'user-1',
          tenantId: null,
          role: 'INSP',
          inspectorId: 'insp-other',
          email: 'insp@test.com',
        } as any,
      }),
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });

  it('requires linked inspector profile for inspector role', async () => {
    const invoiceRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'inv-1',
        inspectorId: 'insp-owner',
        fileKey: 'invoices/insp-owner/inv-1.xlsx',
        isReady: () => true,
        hasFile: () => true,
      }),
    };
    const storageService = {
      generatePresignedGetUrl: vi.fn(),
    };

    const useCase = new DownloadInvoiceUseCase(
      invoiceRepo as any,
      storageService as any,
    );

    await expect(
      useCase.execute({
        invoiceId: 'inv-1',
        actor: {
          userId: 'user-1',
          tenantId: null,
          role: 'INSP',
          email: 'insp@test.com',
        } as any,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
