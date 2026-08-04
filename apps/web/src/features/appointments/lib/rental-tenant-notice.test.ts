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

  // INGOING/OUTGOING never had an occupant, so no notice was ever sent and the
  // server now withholds the cancellation notice too. Offering the checkbox
  // would promise something guaranteed not to happen.
  it.each(['INGOING', 'OUTGOING'])('is false for %s even when SCHEDULED', (flowType) => {
    expect(wasRentalTenantNotified({ status: 'SCHEDULED', flowType })).toBe(false);
  });

  it('is false for a non-notifying flow even when the tenant is CONFIRMED', () => {
    expect(
      wasRentalTenantNotified({
        status: 'DRAFT',
        rentalTenantConfirmationStatus: 'CONFIRMED',
        flowType: 'INGOING',
      }),
    ).toBe(false);
  });

  // Fail open, matching the server predicate: an absent or unknown flow type
  // falls through to the status rules rather than silencing the offer.
  it.each([undefined, null, 'ROUTINE', 'STANDARD'])(
    'falls through to the status rules for flowType %p',
    (flowType) => {
      expect(
        wasRentalTenantNotified({ status: 'SCHEDULED', flowType: flowType as string | null }),
      ).toBe(true);
    },
  );
});
