import type { SatisfactionSurveyEntity } from './satisfaction-survey.entity';

/**
 * A response plus the human code of the inspection it belongs to.
 *
 * The code is resolved in the repository because it needs the appointment's
 * number and the agency's prefix, neither of which lives on the survey row —
 * and the admin UI must never render a raw UUID.
 */
export interface InspectorSurveyRow {
  survey: SatisfactionSurveyEntity;
  appointmentCode: string;
}

export interface FindSurveysResult {
  surveys: InspectorSurveyRow[];
  total: number;
}

export interface ISatisfactionSurveyRepository {
  /**
   * `tenantId` is required, not optional and not nullable: every caller already
   * knows the owning agency (from the portal token, the domain event, or an
   * appointment lookup that was itself tenant-scoped). Making it mandatory means
   * a future caller cannot accidentally read another agency's response by
   * passing an appointment id alone — the isolation lives in the repository
   * rather than depending on each caller remembering to pre-check.
   */
  findByAppointmentId(appointmentId: string, tenantId: string): Promise<SatisfactionSurveyEntity | null>;

  /**
   * Persists a response, or returns the one already stored for the appointment.
   *
   * Idempotent by contract: a duplicate submission must resolve to the original
   * row, never overwrite it. Implementations must not use an upsert — its update
   * branch would silently replace the first answer with the second.
   */
  submit(survey: SatisfactionSurveyEntity): Promise<SatisfactionSurveyEntity>;

  /**
   * Individual responses for one inspector, newest first.
   *
   * `tenantId` is the caller's enforced scope, not a user-supplied filter: pass
   * the agency's id for tenant-pinned roles and `null` only for AM/OP.
   */
  findByInspectorId(
    inspectorId: string,
    tenantId: string | null,
    page: number,
    pageSize: number,
  ): Promise<FindSurveysResult>;
}
