import {
  APPOINTMENT_STATUS_LABELS,
  AppointmentStatus,
  RentalTenantConfirmationStatus,
  ServiceTypeFlowType,
} from '@properfy/shared';

/**
 * Validated pill tone — the WCAG-safe `pill-*` bg/fg pairs. Mirrors the `Badge`
 * component's `tone` union; kept as a plain string literal type so this lib stays
 * React-free.
 */
export type PillTone = 'green' | 'amber' | 'blue' | 'red' | 'gray';

/** The `bg-pill-*` / `text-pill-*-foreground` class pair for each tone. */
export const PILL_TONE_CLASS: Record<PillTone, string> = {
  green: 'bg-pill-green text-pill-green-foreground',
  amber: 'bg-pill-amber text-pill-amber-foreground',
  blue: 'bg-pill-blue text-pill-blue-foreground',
  red: 'bg-pill-red text-pill-red-foreground',
  gray: 'bg-pill-gray text-pill-gray-foreground',
};

/**
 * Appointment status → display label. Labels come from `@properfy/shared` so chips
 * and API error messages agree. The pill TONE lives in `StatusChip`'s `STATUS_TONE`;
 * this map is the label source for that chip.
 */
export const APPOINTMENT_STATUS_MAP: Record<AppointmentStatus, { label: string }> = {
  [AppointmentStatus.DRAFT]: { label: APPOINTMENT_STATUS_LABELS.DRAFT },
  [AppointmentStatus.AWAITING_INSPECTOR]: { label: APPOINTMENT_STATUS_LABELS.AWAITING_INSPECTOR },
  [AppointmentStatus.SCHEDULED]: { label: APPOINTMENT_STATUS_LABELS.SCHEDULED },
  [AppointmentStatus.DONE]: { label: APPOINTMENT_STATUS_LABELS.DONE },
  [AppointmentStatus.CANCELLED]: { label: APPOINTMENT_STATUS_LABELS.CANCELLED },
  [AppointmentStatus.REJECTED]: { label: APPOINTMENT_STATUS_LABELS.REJECTED },
};

/**
 * Rental-tenant confirmation status → display label. The pill tone + icon live in
 * `RentalTenantConfirmationBadge`; this map is its label source.
 */
export const RENTAL_TENANT_CONFIRMATION_STATUS_MAP: Record<RentalTenantConfirmationStatus, { label: string }> = {
  [RentalTenantConfirmationStatus.PENDING]: { label: 'Pending' },
  [RentalTenantConfirmationStatus.CONFIRMED]: { label: 'Confirmed' },
  [RentalTenantConfirmationStatus.UNAVAILABLE]: { label: 'Unavailable' },
  [RentalTenantConfirmationStatus.NO_RESPONSE]: { label: 'No Response' },
};

/** Service flow type → validated pill tone + label (consumed by the flow chip). */
export const FLOW_TYPE_MAP: Record<ServiceTypeFlowType, { tone: PillTone; label: string }> = {
  [ServiceTypeFlowType.ROUTINE]: { tone: 'blue', label: 'Routine' },
  [ServiceTypeFlowType.INGOING]: { tone: 'green', label: 'Ingoing' },
  [ServiceTypeFlowType.OUTGOING]: { tone: 'amber', label: 'Outgoing' },
};
