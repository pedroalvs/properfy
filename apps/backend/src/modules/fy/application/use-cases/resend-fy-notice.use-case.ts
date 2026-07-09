import type { AuthContext, FyResendNotice } from '@properfy/shared';

import { ConflictError } from '../../../../shared/domain/errors';
import type { GeneratePortalTokenUseCase } from '../../../rental-tenant-portal/application/use-cases/generate-portal-token.use-case';

export interface ResendFyNoticeInput {
  appointmentId: string;
  actor: AuthContext;
}

/**
 * Re-mints the portal token and re-dispatches the TENANT_PORTAL_LINK
 * notification — the single-appointment version of what the operator's
 * bulk re-send does. Delivery is queued (pg-boss), hence 202 at the route.
 */
export class ResendFyNoticeUseCase {
  constructor(private readonly generatePortalToken: GeneratePortalTokenUseCase) {}

  async execute(input: ResendFyNoticeInput): Promise<FyResendNotice> {
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

    return { status: 'QUEUED' };
  }
}
