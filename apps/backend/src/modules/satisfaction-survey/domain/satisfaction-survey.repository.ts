import type { SatisfactionSurveyEntity } from './satisfaction-survey.entity';

export interface FindSurveysResult {
  surveys: SatisfactionSurveyEntity[];
  total: number;
}

export interface ISatisfactionSurveyRepository {
  findByAppointmentId(appointmentId: string): Promise<SatisfactionSurveyEntity | null>;

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
