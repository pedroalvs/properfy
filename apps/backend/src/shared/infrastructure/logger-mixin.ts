import { getRequestContext } from './request-context';

/**
 * pino `mixin`: stamps every log line emitted inside a request's or job's
 * AsyncLocalStorage context with `request_id` (and `tenant_id` / `user_id` when
 * known). Workers wrap each job in `runWithRequestContext`, but nothing fed that
 * context back into the logger, so worker log lines carried no `request_id`.
 * A mixin fixes it once for every code path — HTTP and workers alike — instead
 * of threading a `requestId` argument through every handler signature.
 *
 * Field names are snake_case to match the observability convention
 * (`apps/backend/CLAUDE.md §11`). Returns `{}` outside any context so unwrapped
 * logs are unchanged.
 */
export function requestContextMixin(): Record<string, string> {
  const ctx = getRequestContext();
  if (!ctx) return {};
  const fields: Record<string, string> = { request_id: ctx.requestId };
  if (ctx.tenantId) fields.tenant_id = ctx.tenantId;
  if (ctx.userId) fields.user_id = ctx.userId;
  return fields;
}
