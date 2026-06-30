/**
 * classifyPortalLinkAction — pure resolver that decides, per appointment in a
 * service group, whether the tenant confirmation portal link should be sent,
 * skipped, or sent after resetting a stale confirmation.
 *
 * The rule is the single source of truth shared by the group portal-link
 * preview and send use cases. It encodes the user-locked decision:
 *   - skip ONLY when confirmed FOR THE CURRENT date/time;
 *   - if confirmed but the date/time changed (stale), reset + resend;
 *   - otherwise (not sendable status) skip; (not confirmed) send.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyPortalLinkAction,
  type PortalLinkEligibilityInput,
} from '../../../src/modules/appointment/domain/portal-link-eligibility';

const DATE_A = new Date('2026-07-01T00:00:00.000Z');
const DATE_B = new Date('2026-07-08T00:00:00.000Z');
const SLOT_AM = '09:00-12:00';
const SLOT_PM = '13:00-17:00';

function input(overrides: Partial<PortalLinkEligibilityInput>): PortalLinkEligibilityInput {
  return {
    status: 'AWAITING_INSPECTOR',
    scheduledDate: DATE_A,
    timeSlot: SLOT_AM,
    tenantConfirmationStatus: 'PENDING',
    activeCycle: null,
    ...overrides,
  };
}

describe('classifyPortalLinkAction', () => {
  describe('SKIP_NOT_SENDABLE — status outside AWAITING_INSPECTOR/SCHEDULED', () => {
    it.each(['DRAFT', 'DONE', 'CANCELLED', 'REJECTED'])(
      'returns SKIP_NOT_SENDABLE for status %s regardless of confirmation',
      (status) => {
        expect(
          classifyPortalLinkAction(
            input({ status, tenantConfirmationStatus: 'CONFIRMED', activeCycle: { scheduledDate: DATE_A, timeSlot: SLOT_AM, status: 'CONFIRMED' } }),
          ),
        ).toBe('SKIP_NOT_SENDABLE');
      },
    );
  });

  describe('SKIP_ALREADY_CONFIRMED — confirmed for the current date/time', () => {
    it('skips when CONFIRMED and the active cycle date + slot match (AWAITING_INSPECTOR)', () => {
      expect(
        classifyPortalLinkAction(
          input({
            status: 'AWAITING_INSPECTOR',
            tenantConfirmationStatus: 'CONFIRMED',
            activeCycle: { scheduledDate: DATE_A, timeSlot: SLOT_AM, status: 'CONFIRMED' },
          }),
        ),
      ).toBe('SKIP_ALREADY_CONFIRMED');
    });

    it('skips when CONFIRMED and the active cycle date + slot match (SCHEDULED)', () => {
      expect(
        classifyPortalLinkAction(
          input({
            status: 'SCHEDULED',
            tenantConfirmationStatus: 'CONFIRMED',
            activeCycle: { scheduledDate: DATE_A, timeSlot: SLOT_AM, status: 'CONFIRMED' },
          }),
        ),
      ).toBe('SKIP_ALREADY_CONFIRMED');
    });

    it('compares dates day-only (ignores time-of-day differences on the same calendar day)', () => {
      expect(
        classifyPortalLinkAction(
          input({
            tenantConfirmationStatus: 'CONFIRMED',
            scheduledDate: new Date('2026-07-01T00:00:00.000Z'),
            activeCycle: { scheduledDate: new Date('2026-07-01T10:30:00.000Z'), timeSlot: SLOT_AM, status: 'CONFIRMED' },
          }),
        ),
      ).toBe('SKIP_ALREADY_CONFIRMED');
    });
  });

  describe('SEND_AFTER_RESET — stale confirmation (date/time changed)', () => {
    it('resends when CONFIRMED but the active cycle date differs', () => {
      expect(
        classifyPortalLinkAction(
          input({
            tenantConfirmationStatus: 'CONFIRMED',
            scheduledDate: DATE_B,
            activeCycle: { scheduledDate: DATE_A, timeSlot: SLOT_AM, status: 'CONFIRMED' },
          }),
        ),
      ).toBe('SEND_AFTER_RESET');
    });

    it('resends when CONFIRMED but the active cycle time slot differs', () => {
      expect(
        classifyPortalLinkAction(
          input({
            tenantConfirmationStatus: 'CONFIRMED',
            timeSlot: SLOT_PM,
            activeCycle: { scheduledDate: DATE_A, timeSlot: SLOT_AM, status: 'CONFIRMED' },
          }),
        ),
      ).toBe('SEND_AFTER_RESET');
    });

    it('resends when CONFIRMED but there is no active cycle (denorm/cycle inconsistency)', () => {
      expect(
        classifyPortalLinkAction(
          input({ tenantConfirmationStatus: 'CONFIRMED', activeCycle: null }),
        ),
      ).toBe('SEND_AFTER_RESET');
    });
  });

  describe('SEND — sendable status, not confirmed', () => {
    it.each(['PENDING', 'UNAVAILABLE', 'NO_RESPONSE'])(
      'sends when status is sendable and confirmation is %s',
      (tenantConfirmationStatus) => {
        expect(
          classifyPortalLinkAction(input({ tenantConfirmationStatus })),
        ).toBe('SEND');
      },
    );

    it('sends when there is no confirmation cycle yet (never confirmed)', () => {
      expect(
        classifyPortalLinkAction(
          input({ status: 'SCHEDULED', tenantConfirmationStatus: 'PENDING', activeCycle: null }),
        ),
      ).toBe('SEND');
    });
  });
});
