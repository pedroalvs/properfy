import type { PropertyFileType, PropertyFileStatus } from '@properfy/shared';

/** A stored property file row (camelCase domain view of `property_files`). */
export interface PropertyFileEntity {
  id: string;
  tenantId: string;
  propertyId: string;
  appointmentId: string | null;
  issueId: string | null;
  type: PropertyFileType;
  versionGroupId: string;
  version: number;
  fileName: string;
  mime: string;
  sizeBytes: number;
  storageKey: string;
  status: PropertyFileStatus;
  /** Set once the upload passed confirm validation (size + magic bytes). */
  confirmedAt: Date | null;
  uploadedByUserId: string | null;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  purgedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Input to persist a new `PENDING` file (presign) or a new version. */
export interface NewPropertyFile {
  id: string;
  tenantId: string;
  propertyId: string;
  appointmentId: string | null;
  issueId: string | null;
  type: PropertyFileType;
  versionGroupId: string;
  version: number;
  fileName: string;
  mime: string;
  sizeBytes: number;
  storageKey: string;
  status: PropertyFileStatus;
  uploadedByUserId: string | null;
  createdAt: Date;
}

/** A storage object the retention job must purge (minimal projection). */
export interface PurgeableFile {
  id: string;
  storageKey: string;
}
