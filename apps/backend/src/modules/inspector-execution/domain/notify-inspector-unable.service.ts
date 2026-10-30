/**
 * Port for the OP/AM "inspector couldn't complete a job" alert (F03, D6). The
 * can't-do use case calls this once, after commit; the concrete implementation
 * (application/services/notify-inspector-unable.service.ts) resolves the full
 * `INSPECTOR_UNABLE_ALERT` payload and emails every active OP/AM. Kept as a port
 * so the use case does not depend on the notification module directly.
 */
export interface NotifyInspectorUnableInput {
  appointmentId: string;
  tenantId: string;
  inspectorName: string | null;
  reasonCode: string;
  note: string | null;
  occurredAt: Date;
}

export interface INotifyInspectorUnableService {
  notify(input: NotifyInspectorUnableInput): Promise<void>;
}
