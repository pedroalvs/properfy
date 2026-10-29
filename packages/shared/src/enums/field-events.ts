/**
 * Field-events enums (F03). This file is created by TASK-F03-1 with the geofence
 * mode; TASK-F03-2 appends the inspector field-event enums (CANT_DO, LATE_NOTICE,
 * reason codes and labels) here.
 */

/** How the geofence behaves at inspector check-in. */
export const GeofenceMode = {
  /** Record the breach for the operation; never stop the inspector. */
  FLAG: 'FLAG',
  /** Refuse a confirmed out-of-radius check-in. Falls back to FLAG when the
   *  measurement is unreliable (no property coordinates, no accuracy, or
   *  accuracy coarser than the radius). */
  BLOCK: 'BLOCK',
} as const;

export type GeofenceMode = (typeof GeofenceMode)[keyof typeof GeofenceMode];
