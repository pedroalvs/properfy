import type {
  InspectorStatus,
  ServiceTypeEntry,
} from '@properfy/shared';

export interface Inspector {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: InspectorStatus;
  regionsCount: number;
  serviceTypesCount: number;
  /**
   * Average satisfaction rating, or null when there are no responses.
   *
   * Must stay null rather than 0 for "unrated": DataTable's compareValues sends
   * nullish last in BOTH sort directions, which is what keeps unrated inspectors
   * off the top of an ascending sort.
   */
  ratingAvg: number | null;
  ratingCount: number;
  /** Total inspections completed (DONE). */
  completedCount: number;
  createdAt: string;
  updatedAt: string;
  // F01-1: base address — AM/OP and the inspector only (CL_* never receive it).
  // Typed unknown because a legacy row may hold a non-conforming shape. The list
  // returns it to AM/OP (L-F01-07) so the "No base address" badge tooltip is
  // decided without a per-row GET.
  address?: unknown;
  // F01-2 read-only fields (consumed, never written here). null = unknown/absent;
  // the mapper normalizes a pre-deploy API's `undefined` to null so components
  // handle exactly one empty case and DataTable's "nulls last" sort holds.
  /** Latitude of the located base; null = no located base → "No base address". */
  baseLat: number | null;
  /** Instant of the last successful geocode, or null. */
  baseGeocodedAt: string | null;
  /** First app install on any device (D16), or null when never installed. */
  appInstalledAt: string | null;
  /** Last heartbeat from any device (up to 6 h stale), or null. */
  appLastSeenAt: string | null;
  /** Browser push permission on the last device seen; null = never reported. */
  pushEnabled: boolean | null;
  /** App version on the last device seen (e.g. `0.1.0+ab12cd3`), or null. */
  appVersion: string | null;
}

export interface InspectorDetail extends Inspector {
  regionIds: string[];
  serviceTypes: ServiceTypeEntry[];
  fullName?: string | null;
  abn?: string | null;
  dateOfBirth?: string | null;
  insuranceFileKey?: string | null;
  insuranceExpiresAt?: string | null;
  policeCheckFileKey?: string | null;
  policeCheckExpiresAt?: string | null;
  blockedClients?: string[];
  insuranceMetaJson?: { fileName?: string | null; uploadedAt?: string | null } | null;
  policeCheckMetaJson?: { fileName?: string | null; uploadedAt?: string | null } | null;
}

export interface InspectorFormData {
  name: string;
  email: string;
  /** Create-only: the inspector's initial login password. Never sent on edit. */
  password: string;
  confirmPassword: string;
  phone: string;
  status: string;
  // F01-1: base address (geocoded in permanent mode on the backend). Required on
  // create; country is always 'AU' and is not a form field. Street/suburb/city/
  // state/postcode are mandatory; number/complement optional.
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressSuburb: string;
  addressCity: string;
  addressState: string;
  addressPostcode: string;
  regionIds: string[];
  serviceTypes: string;
  fullName: string;
  abn: string;
  dateOfBirth: string;
  insuranceFileKey: string;
  insuranceExpiresAt: string;
  policeCheckFileKey: string;
  policeCheckExpiresAt: string;
  blockedClients: string[];
}

export type InspectorFormErrors = Partial<Record<keyof InspectorFormData, string>>;

export const EMPTY_INSPECTOR_FORM: InspectorFormData = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  status: '',
  addressStreet: '',
  addressNumber: '',
  addressComplement: '',
  addressSuburb: '',
  addressCity: '',
  addressState: '',
  addressPostcode: '',
  regionIds: [],
  serviceTypes: '',
  fullName: '',
  abn: '',
  dateOfBirth: '',
  insuranceFileKey: '',
  insuranceExpiresAt: '',
  policeCheckFileKey: '',
  policeCheckExpiresAt: '',
  blockedClients: [],
};

export interface InspectorFiltersState {
  search: string;
  status: string;
  /** F01-2: when true, list only inspectors without a located base address. */
  missingBaseAddress: boolean;
}

export const DEFAULT_FILTERS: InspectorFiltersState = {
  search: '',
  status: '',
  missingBaseAddress: false,
};

/** One satisfaction response as shown in the admin drawer. */
export interface InspectorSurvey {
  rating: number;
  comment: string | null;
  submittedAt: string;
  /** Human code of the inspection — never a raw id. */
  appointmentCode: string;
}
