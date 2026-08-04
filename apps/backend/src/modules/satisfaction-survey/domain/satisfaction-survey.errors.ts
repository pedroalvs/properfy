import { ConflictError } from '../../../shared/domain/errors';

export class PortalSurveyNotEligibleError extends ConflictError {
  constructor(message = 'This inspection is not open for a satisfaction rating') {
    super('PORTAL_SURVEY_NOT_ELIGIBLE', message);
  }
}

export class PortalSurveyNoInspectorError extends ConflictError {
  constructor() {
    super('PORTAL_SURVEY_NO_INSPECTOR', 'This inspection has no inspector to rate');
  }
}
