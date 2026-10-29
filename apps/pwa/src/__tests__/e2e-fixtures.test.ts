import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  meResponseSchema,
  inspectorScheduleMonthResponseSchema,
  marketplaceOfferResponseSchema,
  marketplaceOfferDetailResponseSchema,
  inspectorAppointmentDetailResponseSchema,
  finishInspectionResponseSchema,
} from '@properfy/shared';
import {
  INSPECTOR_ME,
  SCHEDULE_MONTH_EMPTY,
  SCHEDULE_MONTH_ONE,
  OFFER,
  OFFER_DETAIL,
  APPOINTMENT_DETAIL,
  FINISH_RESULT,
  LOGIN_401,
} from '../../tests/e2e/support/fixtures';

/**
 * These tests pin every E2E response fixture to the canonical `@properfy/shared`
 * response schema for its route, so a mock can never silently drift from the API
 * contract (root CLAUDE.md §9; memory `feedback_test_fixtures_must_match_api_shape`).
 *
 * NOTE on `.strict()`: Zod 3's `.strict()` only rejects unknown keys at the TOP
 * object level — nested objects keep the default `strip` behaviour, so a dead key
 * inside a nested object is NOT caught here. The shared response schemas are not
 * themselves `.strict()`, so we apply it per fixture to catch top-level drift.
 */
describe('E2E fixtures match the shared response contracts', () => {
  it('INSPECTOR_ME satisfies meResponseSchema (strict)', () => {
    expect(() => meResponseSchema.strict().parse(INSPECTOR_ME)).not.toThrow();
  });

  it('rejects the legacy minimal /v1/me fixture (uuid + required fields)', () => {
    const legacy = { id: 'user-1', name: 'Inspector', email: 'insp@test.com', role: 'INSP', tenantId: null };
    const result = meResponseSchema.strict().safeParse(legacy);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('id'); // 'user-1' is not a uuid
      expect(paths).toContain('branchId'); // required field absent
      expect(paths).toContain('totpEnabled');
    }
  });

  it('proves .strict() is active: an extra top-level key fails with unrecognized_keys', () => {
    const result = meResponseSchema.strict().safeParse({ ...INSPECTOR_ME, legacyField: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it('SCHEDULE_MONTH_EMPTY satisfies inspectorScheduleMonthResponseSchema (strict)', () => {
    expect(() => inspectorScheduleMonthResponseSchema.strict().parse(SCHEDULE_MONTH_EMPTY)).not.toThrow();
  });

  it('SCHEDULE_MONTH_ONE satisfies inspectorScheduleMonthResponseSchema (strict)', () => {
    expect(() => inspectorScheduleMonthResponseSchema.strict().parse(SCHEDULE_MONTH_ONE)).not.toThrow();
  });

  it('OFFER satisfies marketplaceOfferResponseSchema (strict)', () => {
    expect(() => marketplaceOfferResponseSchema.strict().parse(OFFER)).not.toThrow();
  });

  it('OFFER_DETAIL satisfies marketplaceOfferDetailResponseSchema (strict)', () => {
    expect(() => marketplaceOfferDetailResponseSchema.strict().parse(OFFER_DETAIL)).not.toThrow();
  });

  it('APPOINTMENT_DETAIL satisfies inspectorAppointmentDetailResponseSchema (strict)', () => {
    expect(() => inspectorAppointmentDetailResponseSchema.strict().parse(APPOINTMENT_DETAIL)).not.toThrow();
  });

  it('FINISH_RESULT satisfies finishInspectionResponseSchema (strict)', () => {
    expect(() => finishInspectionResponseSchema.strict().parse(FINISH_RESULT)).not.toThrow();
  });

  it('LOGIN_401 matches the error envelope and carries AUTH_INVALID_CREDENTIALS', () => {
    // The shared package exports no error schema; the envelope contract is root CLAUDE.md §9.
    const errorEnvelopeSchema = z
      .object({
        error: z
          .object({ code: z.string(), message: z.string(), details: z.unknown().optional() })
          .strict(),
      })
      .strict();
    expect(() => errorEnvelopeSchema.parse(LOGIN_401)).not.toThrow();
    expect(LOGIN_401.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });
});
