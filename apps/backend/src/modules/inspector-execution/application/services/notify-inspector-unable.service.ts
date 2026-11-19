import type { FieldIssueReason } from '@properfy/shared';
import { FIELD_ISSUE_REASON_LABELS } from '@properfy/shared';
import type {
  INotifyInspectorUnableService,
  NotifyInspectorUnableInput,
} from '../../domain/notify-inspector-unable.service';
import type { CreateNotificationUseCase } from '../../../notification/application/use-cases/create-notification.use-case';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';
import type { Logger } from '../../../../shared/infrastructure/logger';

/**
 * Payload contract for the INSPECTOR_UNABLE_ALERT template. The platform seed
 * template may only use these variables (asserted by
 * platform-notification-templates.test.ts); the payload literal below is typed
 * against this list so adding/removing a key here is a compile-time error.
 *
 * Deliberately NO inspector coordinates: an agency-visible alert never carries the
 * inspector's raw lat/lng (F03 privacy, §7.9).
 */
export const INSPECTOR_UNABLE_ALERT_PAYLOAD_KEYS = [
  'appointmentId',
  'inspectorName',
  'fieldIssueReason',
  'fieldIssueNote',
] as const;

type InspectorUnableAlertPayload = Record<
  (typeof INSPECTOR_UNABLE_ALERT_PAYLOAD_KEYS)[number],
  string
>;

/**
 * Concrete OP/AM alert for "Can't do this job" (F03, D6). Fans the
 * INSPECTOR_UNABLE_ALERT email out to every active OP/AM. Called once, after the
 * rejection has committed, so a failure here is logged and swallowed — it must
 * never fail the inspector's request.
 */
export class NotifyInspectorUnableService implements INotifyInspectorUnableService {
  constructor(
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly createNotificationUseCase: CreateNotificationUseCase,
    private readonly logger: Logger,
  ) {}

  async notify(input: NotifyInspectorUnableInput): Promise<void> {
    const recipients = (await this.userManagementRepo.findActiveByRoles(['OP', 'AM'])).map(
      (user) => user.email,
    );
    if (recipients.length === 0) {
      this.logger.error(
        { appointmentId: input.appointmentId },
        'No active OP/AM users to receive inspector unable alerts',
      );
      return;
    }

    const payloadJson: InspectorUnableAlertPayload = {
      appointmentId: input.appointmentId,
      inspectorName: input.inspectorName ?? 'An inspector',
      fieldIssueReason:
        FIELD_ISSUE_REASON_LABELS[input.reasonCode as FieldIssueReason] ?? input.reasonCode,
      fieldIssueNote: input.note ?? '',
    };

    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        this.createNotificationUseCase.execute({
          tenantId: input.tenantId,
          appointmentId: input.appointmentId,
          recipient,
          channel: 'EMAIL',
          templateCode: 'INSPECTOR_UNABLE_ALERT',
          payloadJson,
        }),
      ),
    );
    for (const [index, settled] of results.entries()) {
      if (settled.status === 'rejected') {
        this.logger.error(
          { appointmentId: input.appointmentId, recipient: recipients[index], error: settled.reason },
          'Failed to create inspector unable alert for recipient',
        );
      }
    }
  }
}
