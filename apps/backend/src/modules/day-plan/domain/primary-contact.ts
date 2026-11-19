import { AppointmentContactRole, isE164Au } from '@properfy/shared';

/** A candidate contact for a stop (flat snapshot from the appointment). */
export interface SelectableContact {
  name: string;
  phone: string | null;
  isPrimary: boolean;
  role: AppointmentContactRole;
  createdAt: Date;
}

export interface SelectedPrimaryContact {
  name: string;
  /** Only a valid AU E.164 number; otherwise `null` (no call button). */
  phone: string | null;
  role: AppointmentContactRole;
}

/** Tie-break order when no contact is flagged `is_primary` (L-F04-08). */
const ROLE_ORDER: AppointmentContactRole[] = [
  AppointmentContactRole.RENTAL_TENANT,
  AppointmentContactRole.RENTAL_TENANT_REPRESENTATIVE,
  AppointmentContactRole.HOUSEKEEPER,
  AppointmentContactRole.PROPERTY_MANAGER,
  AppointmentContactRole.BROKER,
  AppointmentContactRole.OTHER,
];

function roleRank(role: AppointmentContactRole): number {
  const index = ROLE_ORDER.indexOf(role);
  return index === -1 ? ROLE_ORDER.length : index;
}

/**
 * Pick one primary contact per stop: `is_primary desc` → role order → `created_at
 * asc` (L-F04-08). The phone is surfaced only when it is a valid E.164 number.
 */
export function selectPrimaryContact(
  contacts: SelectableContact[],
): SelectedPrimaryContact | null {
  const chosen = [...contacts].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    const rank = roleRank(a.role) - roleRank(b.role);
    if (rank !== 0) return rank;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
  if (!chosen) return null;
  return {
    name: chosen.name,
    phone: chosen.phone && isE164Au(chosen.phone) ? chosen.phone : null,
    role: chosen.role,
  };
}
