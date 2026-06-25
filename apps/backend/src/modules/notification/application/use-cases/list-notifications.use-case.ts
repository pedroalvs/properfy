import type { AuthContext } from '@properfy/shared';
import type {
  INotificationRepository,
  NotificationFilters,
  NotificationPagination,
} from '../../domain/notification.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

export interface ListNotificationsInput {
  tenantId?: string;
  appointmentId?: string;
  channel?: string;
  status?: string;
  templateCode?: string;
  fromDate?: string;
  toDate?: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  actor: AuthContext;
}

export interface NotificationOutputItem {
  id: string;
  tenantId: string;
  appointmentId: string | null;
  recipient: string;
  channel: string;
  templateCode: string;
  status: string;
  providerName: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  retryCount: number;
  createdAt: string;
}

export interface ListNotificationsOutput {
  data: NotificationOutputItem[];
  total: number;
  page: number;
  pageSize: number;
}

export class ListNotificationsUseCase {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ListNotificationsInput): Promise<ListNotificationsOutput> {
    const { actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'notification.list',
      entityType: 'Notification',
    });

    const filters: NotificationFilters = {};
    const pagination: NotificationPagination = {
      page: input.page,
      pageSize: input.pageSize,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
    };

    if (input.tenantId) filters.tenantId = input.tenantId;
    if (input.appointmentId) filters.appointmentId = input.appointmentId;
    if (input.channel) filters.channel = input.channel as NotificationFilters['channel'];
    if (input.status) filters.status = input.status as NotificationFilters['status'];
    if (input.templateCode) filters.templateCode = input.templateCode;
    if (input.fromDate) filters.fromDate = input.fromDate;
    if (input.toDate) filters.toDate = input.toDate;

    const [data, total] = await Promise.all([
      this.notificationRepo.findAll(filters, pagination),
      this.notificationRepo.count(filters),
    ]);

    return {
      data: data.map((notification) => ({
        id: notification.id,
        tenantId: notification.tenantId,
        appointmentId: notification.appointmentId,
        recipient: notification.recipient,
        channel: notification.channel,
        templateCode: notification.templateCode,
        status: notification.status,
        providerName: notification.providerName,
        sentAt: notification.sentAt ? notification.sentAt.toISOString() : null,
        deliveredAt: notification.deliveredAt ? notification.deliveredAt.toISOString() : null,
        failedAt: notification.failedAt ? notification.failedAt.toISOString() : null,
        failureReason: notification.failureReason,
        retryCount: notification.retryCount,
        createdAt: notification.createdAt.toISOString(),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
}
