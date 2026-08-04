export interface SatisfactionSurveyProps {
  id: string;
  appointmentId: string;
  tenantId: string;
  inspectorId: string;
  rating: number;
  comment: string | null;
  submittedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/**
 * A rental tenant's satisfaction response for one executed inspection.
 *
 * Immutable by construction: there are no setters and every field is readonly.
 * A response is a record of what someone said at a point in time, so the submit
 * path returns the existing row on a replay rather than mutating it.
 */
export class SatisfactionSurveyEntity {
  readonly id: string;
  readonly appointmentId: string;
  readonly tenantId: string;
  readonly inspectorId: string;
  readonly rating: number;
  readonly comment: string | null;
  readonly submittedAt: Date;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;

  constructor(props: SatisfactionSurveyProps) {
    this.id = props.id;
    this.appointmentId = props.appointmentId;
    this.tenantId = props.tenantId;
    this.inspectorId = props.inspectorId;
    this.rating = props.rating;
    this.comment = props.comment;
    this.submittedAt = props.submittedAt;
    this.ipAddress = props.ipAddress;
    this.userAgent = props.userAgent;
    this.createdAt = props.createdAt;
  }
}
