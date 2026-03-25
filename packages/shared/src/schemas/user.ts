import { z } from 'zod';
import { paginationSchema } from './pagination';

// Create user — password rules same as changePasswordSchema in auth.ts
export const createUserSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  email: z.string().email().max(254).transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  role: z.enum(['CL_ADMIN', 'CL_USER', 'INSP']),
  branchId: z.string().uuid().optional(),
  phone: z.string().max(20).optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

// Update user (partial, role change restrictions enforced in use case)
export const updateUserSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  phone: z.string().max(20).optional(),
  branchId: z.string().uuid().nullable().optional(),
  role: z.enum(['CL_ADMIN', 'CL_USER', 'INSP']).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetUserPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
});
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;

// List users query
export const listUsersQuerySchema = paginationSchema.extend({
  status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']).optional(),
  role: z.enum(['AM', 'OP', 'CL_ADMIN', 'CL_USER', 'INSP']).optional(),
  search: z.string().max(200).optional(),
});
export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;
