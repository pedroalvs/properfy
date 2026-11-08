import type { PropertyFileResponse, PropertyIssueResponse } from '@properfy/shared';
import type { PropertyFileEntity } from '../domain/property-file.entity';
import type { PropertyIssueEntity } from '../domain/property-issue.entity';

export function toPropertyFileResponse(file: PropertyFileEntity): PropertyFileResponse {
  return {
    id: file.id,
    propertyId: file.propertyId,
    appointmentId: file.appointmentId,
    issueId: file.issueId,
    type: file.type,
    versionGroupId: file.versionGroupId,
    version: file.version,
    fileName: file.fileName,
    mime: file.mime,
    sizeBytes: file.sizeBytes,
    status: file.status,
    uploadedByUserId: file.uploadedByUserId,
    createdAt: file.createdAt.toISOString(),
  };
}

export function toPropertyIssueResponse(
  issue: PropertyIssueEntity,
  photos: PropertyFileEntity[],
): PropertyIssueResponse {
  return {
    id: issue.id,
    propertyId: issue.propertyId,
    appointmentId: issue.appointmentId,
    reason: issue.reason,
    source: issue.source,
    createdByUserId: issue.createdByUserId,
    cantDoEventId: issue.cantDoEventId,
    seenAt: issue.seenAt ? issue.seenAt.toISOString() : null,
    seenByUserId: issue.seenByUserId,
    createdAt: issue.createdAt.toISOString(),
    photos: photos.map(toPropertyFileResponse),
  };
}

/**
 * Strip actor identity from a file DTO so an inspector never learns who uploaded
 * a peer's file (D28). Content (name, type, version, photo) is kept.
 */
export function maskPropertyFileForInspector(file: PropertyFileResponse): PropertyFileResponse {
  return { ...file, uploadedByUserId: null };
}

/**
 * Strip peer identity from an issue DTO for an inspector (D28): author, seer and
 * the linked field event are nulled; the reason, source and photos stay visible.
 */
export function maskPropertyIssueForInspector(issue: PropertyIssueResponse): PropertyIssueResponse {
  return {
    ...issue,
    createdByUserId: null,
    seenByUserId: null,
    cantDoEventId: null,
    photos: issue.photos.map(maskPropertyFileForInspector),
  };
}
