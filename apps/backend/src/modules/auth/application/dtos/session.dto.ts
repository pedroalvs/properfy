import { z } from 'zod';

/** GET /v1/auth/sessions response — the caller's active sessions. */
export const sessionListResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().uuid(),
      userAgent: z.string().nullable(),
      ipAddress: z.string().nullable(),
      lastActiveAt: z.string().datetime(),
      createdAt: z.string().datetime(),
      isCurrent: z.boolean(),
    }),
  ),
});

/** DELETE /v1/auth/sessions/:sessionId params. */
export const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid(),
});
