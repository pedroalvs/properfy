import { describe, it, expect } from 'vitest';
import { wasRentalTenantNotified } from './rental-tenant-notice';

describe('wasRentalTenantNotified', () => {
  it('treats a SCHEDULED appointment as told, even when the tenant never confirmed', () => {
    // The reason this helper exists: INSPECTION_NOTICE goes out on the move into
    // SCHEDULED regardless of confirmation. Requiring CONFIRMED meant a tenant who
    // was told the date but never clicked confirm could never be told it was off.
    expect(
      wasRentalTenantNotified({ status: 'SCHEDULED', rentalTenantConfirmationStatus: 'PENDING' }),
    ).toBe(true);
  });

  it('treats a confirmed tenant as told even after the appointment left SCHEDULED', () => {
    // Confirming is only possible if the notice arrived, so this arm survives a
    // reopen back to DRAFT.
    expect(
      wasRentalTenantNotified({ status: 'DRAFT', rentalTenantConfirmationStatus: 'CONFIRMED' }),
    ).toBe(true);
  });

  it.each(['DRAFT', 'AWAITING_INSPECTOR'])(
    'treats %s with an unconfirmed tenant as never told',
    (status) => {
      expect(
        wasRentalTenantNotified({ status, rentalTenantConfirmationStatus: 'PENDING' }),
      ).toBe(false);
    },
  );

  it('tolerates a missing confirmation status', () => {
    expect(wasRentalTenantNotified({ status: 'AWAITING_INSPECTOR' })).toBe(false);
    expect(wasRentalTenantNotified({ status: 'SCHEDULED' })).toBe(true);
  });

  it('does not treat UNAVAILABLE or NO_RESPONSE as told on their own', () => {
    // Both mean the tenant engaged with the portal, but the portal link is sent
    // separately from the notice; SCHEDULED is what proves the notice went out.
    expect(
      wasRentalTenantNotified({ status: 'DRAFT', rentalTenantConfirmationStatus: 'UNAVAILABLE' }),
    ).toBe(false);
    expect(
      wasRentalTenantNotified({ status: 'DRAFT', rentalTenantConfirmationStatus: 'NO_RESPONSE' }),
    ).toBe(false);
  });
});
