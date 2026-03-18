export interface DomainEvent<T = unknown> {
  type: string;
  payload: T;
  occurredAt: string;
  actorId?: string;
  tenantId?: string;
}

export interface AppointmentStatusChangedPayload {
  appointmentId: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
}

export interface ServiceGroupAcceptedPayload {
  serviceGroupId: string;
  inspectorId: string;
  appointmentIds: string[];
}

export interface NotificationFailedPayload {
  notificationId: string;
  channel: string;
  errorMessage: string;
  retryCount: number;
}

export interface FinancialEntriesCreatedPayload {
  appointmentId: string;
  entries: Array<{ id: string; type: string; amount: number }>;
}
