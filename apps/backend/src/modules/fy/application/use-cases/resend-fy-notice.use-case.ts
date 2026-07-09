import type { AuthContext, FyResendNotice } from '@properfy/shared';

import { ConflictError } from '../../../../shared/domain/errors';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { GeneratePortalTokenUseCase } from '../../../rental-tenant-portal/application/use-cases/generate-portal-token.use-case';

export interface ResendFyNoticeInput {
  appointmentId: string;
  actor: AuthContext;
}

const IDEMPOTENCY_SCOPE = 'fy-resend-notice';
const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * Re-mints the portal token and re-dispatches the TENANT_PORTAL_LINK
 * notification — the single-appointment version of what the operator's
 * bulk re-send does. Delivery is queued (pg-boss), hence 202 at the route.
 *
 * Idempotent per appointment per UTC day (same pattern as the bulk re-send):
 * a bot retry or a repeated tenant request within the same day replays the
 * cached result instead of minting another token and duplicating the email.
 */
export class ResendFyNoticeUseCase {
  constructor(
    private readonly generatePortalToken: GeneratePortalTokenUseCase,
    private readonly idempotency: IIdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: ResendFyNoticeInput): Promise<FyResendNotice> {
    const dayKey = this.clock().toISOString().slice(0, 10);
    const idemKey = `fy_resend:${input.appointmentId}:${dayKey}`;

    const cached = await this.idempotency.get<FyResendNotice>(idemKey, IDEMPOTENCY_SCOPE);
    if (cached) {
      return cached;
    }

    const dispatch = await this.generatePortalToken.execute({
      appointmentId: input.appointmentId,
      actor: input.actor,
    });

    if (!dispatch.dispatched) {
      throw new ConflictError(
        'NO_PRIMARY_CONTACT',
        'Appointment has no primary contact to notify',
      );
    }

    const result: FyResendNotice = { status: 'QUEUED' };
    await this.idempotency.set(idemKey, IDEMPOTENCY_SCOPE, result, IDEMPOTENCY_TTL_HOURS);
    return result;
  }
}
