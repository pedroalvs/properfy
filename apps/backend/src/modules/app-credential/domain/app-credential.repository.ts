import type { AppCredentialEntity } from './app-credential.entity';

export interface AppCredentialFilters {
  /** AM/OP only — optional agency filter (the list shows all agencies by default). */
  tenantId?: string;
  /**
   * Optional branch filter. Matches credentials scoped to this branch OR
   * agency-wide credentials (branch_id IS NULL).
   */
  branchId?: string;
  isActive?: boolean;
  /** Free-text match against name / username (ILIKE). */
  search?: string;
}

export interface AppCredentialPagination {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

/** List row enriched with the owning agency's and branch's display names. */
export interface AppCredentialListRow {
  credential: AppCredentialEntity;
  tenantName: string | null;
  branchName: string | null;
}

/** Patch shape for update(). Secrets are plaintext; the repo encrypts them. */
export type AppCredentialUpdateData = Partial<{
  branchId: string | null;
  name: string;
  username: string;
  password: string;
  needsAuthCode: boolean;
  authCode: string | null;
  appUrl: string | null;
  instructionsUrl: string | null;
  instructionsPassword: string | null;
  isActive: boolean;
}>;

export interface IAppCredentialRepository {
  /** Global lookup by id (AM/OP are cross-tenant). Secrets are decrypted. */
  findById(id: string): Promise<AppCredentialEntity | null>;
  findAll(filters: AppCredentialFilters, pagination: AppCredentialPagination): Promise<AppCredentialListRow[]>;
  count(filters: AppCredentialFilters): Promise<number>;
  /** Active credentials in a tenant matching the query — powers the appointment-form autocomplete. */
  search(tenantId: string, query: string): Promise<AppCredentialEntity[]>;
  /** Save expects plaintext secrets on the entity; the repo encrypts them. */
  save(credential: AppCredentialEntity): Promise<void>;
  /** When secrets are present they are plaintext; the repo encrypts before persisting. */
  update(id: string, data: AppCredentialUpdateData): Promise<void>;

  // --- Appointment linkage (live reference, no snapshot) ---

  /** Bulk lookup used to validate tenant ownership before linking to an appointment. */
  findByIds(ids: string[]): Promise<AppCredentialEntity[]>;
  /** Credentials currently linked to an appointment (decrypted), insertion order. */
  findByAppointmentId(appointmentId: string): Promise<AppCredentialEntity[]>;
  /** Replace all junction rows for an appointment with the given credential ids. */
  replaceAppointmentLinks(appointmentId: string, appCredentialIds: string[]): Promise<void>;
}
