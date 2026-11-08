import type { PropertyFileResponse } from '@properfy/shared';

/**
 * `GET /v1/property-files` returns every version of a file as its own READY row
 * (no latest-per-group dedup, A10). These helpers collapse that to one entry per
 * `versionGroupId` for the subtab, and expand a group back to its full history
 * for the Versions drawer — all without a dedicated "list versions" route.
 */

/** Latest (max `version`) file per `versionGroupId`, preserving first-seen order. */
export function groupLatestVersions(files: PropertyFileResponse[]): PropertyFileResponse[] {
  const latestByGroup = new Map<string, PropertyFileResponse>();
  const order: string[] = [];
  for (const file of files) {
    const existing = latestByGroup.get(file.versionGroupId);
    if (!existing) {
      order.push(file.versionGroupId);
      latestByGroup.set(file.versionGroupId, file);
    } else if (file.version > existing.version) {
      latestByGroup.set(file.versionGroupId, file);
    }
  }
  return order.map((groupId) => latestByGroup.get(groupId)!);
}

/** All versions of a group, newest first. */
export function versionsForGroup(
  files: PropertyFileResponse[],
  versionGroupId: string,
): PropertyFileResponse[] {
  return files
    .filter((f) => f.versionGroupId === versionGroupId)
    .sort((a, b) => b.version - a.version);
}

/** True when a group has more than one version (a Versions drawer is worth showing). */
export function hasMultipleVersions(
  files: PropertyFileResponse[],
  versionGroupId: string,
): boolean {
  let count = 0;
  for (const f of files) {
    if (f.versionGroupId === versionGroupId) {
      count += 1;
      if (count > 1) return true;
    }
  }
  return false;
}
