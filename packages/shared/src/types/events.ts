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

export interface AppointmentTransitionEvent {
  appointmentId: string;
  tenantId: string;
  fromStatus: string;
  toStatus: string;
  actorId: string;
  actorType: 'USER' | 'SYSTEM';
  reason?: string;
  metadata?: Record<string, unknown>;
  /**
   * The group the appointment belonged to at transition time, so subscribers
   * reacting to a group emptying do not need a second query. Note this is the
   * appointment's group *after* the update — a flow that moves an appointment
   * between groups must handle the vacated group itself.
   */
  serviceGroupId?: string | null;
}
