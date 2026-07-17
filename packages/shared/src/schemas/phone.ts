import { z } from 'zod';
import { toE164Au } from '../constants/phone';

/**
 * Australian phone number input schema: accepts local (0412 345 678,
 * 0412345678) or international (+61 412 345 678) forms and transforms the
 * value to canonical E.164 (+61412345678) so all persisted phones share one
 * format.
 */
export const auPhoneSchema = z
  .string()
  .max(30)
  .refine((v) => toE164Au(v) !== null, { message: 'Must be a valid Australian phone number' })
  .transform((v) => toE164Au(v) as string);
