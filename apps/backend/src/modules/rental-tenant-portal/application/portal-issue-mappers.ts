import type {
  PortalIssuePhotoResponse,
  PortalPropertyIssueResponse,
} from '@properfy/shared';
import type { PropertyFileEntity } from '../../property-file/domain/property-file.entity';
import type { PropertyIssueEntity } from '../../property-file/domain/property-issue.entity';

/**
 * Privacy-reduced DTO mappers for the rental-tenant portal (F10-4). A tenant
 * sees only what they submitted: issue reason, creation time and photo metadata.
 * Staff-internal fields — the reviewer identity (`seenByUserId`/`seenAt`), the
 * author (`createdByUserId`), the `source`, `cantDoEventId`, the storage key,
 * the uploader and the appointment/property ids — are never exposed.
 */

export function toPortalIssuePhotoResponse(file: PropertyFileEntity): PortalIssuePhotoResponse {
  return {
    id: file.id,
    fileName: file.fileName,
    mime: file.mime,
    status: file.status,
    createdAt: file.createdAt.toISOString(),
  };
}

export function toPortalPropertyIssueResponse(
  issue: PropertyIssueEntity,
  photos: PropertyFileEntity[],
): PortalPropertyIssueResponse {
  return {
    id: issue.id,
    reason: issue.reason,
    createdAt: issue.createdAt.toISOString(),
    photos: photos.map(toPortalIssuePhotoResponse),
  };
}
