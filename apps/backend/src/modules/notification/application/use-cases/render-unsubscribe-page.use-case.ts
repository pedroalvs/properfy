import type { NotificationChannel, NotificationClass } from '@properfy/shared';
import type { UnsubscribeTokenService } from '../../domain/unsubscribe-token.service';

export interface RenderUnsubscribePageInput {
  token: string;
}

export type RenderUnsubscribePageOutput =
  | {
      ok: true;
      recipient: string;
      channel: NotificationChannel;
      tenantId: string;
      notificationClass: NotificationClass;
    }
  | {
      ok: false;
      reason: 'expired' | 'invalid';
    };

/**
 * Feature 018 US1: server-side render of the public unsubscribe confirmation page.
 *
 * This use case is read-only — it validates the token and returns metadata the
 * route handler uses to interpolate the HTML template. It does NOT mutate consent.
 * Consent mutation happens on POST via `ProcessUnsubscribeUseCase`.
 *
 * Expired and invalid tokens both return a non-throwing result so the route
 * handler can render the friendly "link expired" page with HTTP 200 — this
 * prevents information leakage via status-code probing.
 */
export class RenderUnsubscribePageUseCase {
  constructor(private readonly tokenService: UnsubscribeTokenService) {}

  execute(input: RenderUnsubscribePageInput): RenderUnsubscribePageOutput {
    const result = this.tokenService.verify(input.token);
    if (!result.valid) {
      return {
        ok: false,
        reason: result.reason === 'expired' ? 'expired' : 'invalid',
      };
    }

    // TRANSACTIONAL tokens must not yield a valid unsubscribe page
    if (result.payload.notificationClass === 'TRANSACTIONAL') {
      return { ok: false, reason: 'invalid' };
    }

    return {
      ok: true,
      recipient: result.payload.recipient,
      channel: result.payload.channel,
      tenantId: result.payload.tenantId,
      notificationClass: result.payload.notificationClass,
    };
  }
}
