import {
  ConflictError,
  DomainError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../../shared/domain/errors';

/** 404 — a plan exists for neither today nor a past day. */
export const dayPlanNotFound = (): NotFoundError =>
  new NotFoundError('DAY_PLAN_NOT_FOUND', 'There is no route for this day');

/** 404 — a D+1 plan is not yet published and the publication window is closed. */
export const dayPlanNotPublished = (): NotFoundError =>
  new NotFoundError('DAY_PLAN_NOT_PUBLISHED', "Your route for this day isn't ready yet");

/** 404 — AM/OP addressed an inspector that does not exist. */
export const inspectorNotFound = (): NotFoundError =>
  new NotFoundError('INSPECTOR_NOT_FOUND', 'Inspector not found');

/** 409 — the client's `basedOnVersion` is behind the stored version. */
export const dayPlanVersionConflict = (currentVersion: number): ConflictError =>
  new ConflictError(
    'DAY_PLAN_VERSION_CONFLICT',
    'Your route was updated. Review it before saving your order.',
    { currentVersion },
  );

/** 409 — the plan is STALE / its fingerprint diverged; reload before saving. */
export const dayPlanStale = (): ConflictError =>
  new ConflictError(
    'DAY_PLAN_STALE',
    'This route is out of date. Reload it before saving your order.',
  );

/** 422 — the submitted ids do not match the current reorderable set. */
export const dayPlanOrderMismatch = (expectedAppointmentIds: string[]): UnprocessableEntityError =>
  new UnprocessableEntityError(
    "The stops don't match this route",
    { expectedAppointmentIds },
    'DAY_PLAN_ORDER_MISMATCH',
  );

/** 422 — a write was attempted against a past day. */
export const dayPlanDateInPast = (): UnprocessableEntityError =>
  new UnprocessableEntityError('This day has already passed', undefined, 'DAY_PLAN_DATE_IN_PAST');

/** 422 — the day has started (a stop is executed); the origin cannot change (L-F04-07). */
export const dayPlanAlreadyStarted = (): UnprocessableEntityError =>
  new UnprocessableEntityError(
    'Your day has started; the route continues from your last stop.',
    undefined,
    'DAY_PLAN_ALREADY_STARTED',
  );

/** 422 — permanent geocoding returned no result for the day-origin address. */
export const dayPlanOriginNotFound = (): UnprocessableEntityError =>
  new UnprocessableEntityError(
    "We couldn't find this address. Check it and try again.",
    undefined,
    'DAY_PLAN_ORIGIN_NOT_FOUND',
  );

/** 422 — INSP requested a route sheet older than 30 days (L-F04-10). */
export const dayPlanSheetTooOld = (): UnprocessableEntityError =>
  new UnprocessableEntityError(
    'Route sheets are available for the last 30 days',
    undefined,
    'DAY_PLAN_SHEET_TOO_OLD',
  );

/** 422 — weights preview date outside today..today+14 (L-F04-14). */
export const dayPlanPreviewDateOutOfRange = (): UnprocessableEntityError =>
  new UnprocessableEntityError(
    'Pick a day between today and 14 days ahead',
    undefined,
    'DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE',
  );

/** 503 — any geocoder failure while setting a day origin (never a 500). */
export class DayPlanOriginGeocoderUnavailableError extends DomainError {
  constructor() {
    super(
      'DAY_PLAN_ORIGIN_GEOCODER_UNAVAILABLE',
      'Address search is unavailable right now. Try again later.',
      503,
    );
    this.name = 'DayPlanOriginGeocoderUnavailableError';
  }
}
