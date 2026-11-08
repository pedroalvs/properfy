import {
  PropertyFileType,
  type PropertyFileResponse,
  type PropertyIssueResponse,
  type PropertyIssueSource,
} from '@properfy/shared';

/** How to present a file in the read-only list: inline image, PDF (new tab), or a generic download. */
export type FilePreviewKind = 'image' | 'pdf' | 'other';

export function previewKind(mime: string): FilePreviewKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

/** Origin badge for an issue card (the inspector sees origin, not author — author is masked server-side). */
export const ISSUE_ORIGIN_LABELS: Record<PropertyIssueSource, string> = {
  INSPECTOR: 'Inspector',
  STAFF: 'Staff',
  RENTAL_TENANT_PORTAL: 'Tenant',
};

export function issueOriginLabel(source: PropertyIssueSource): string {
  return ISSUE_ORIGIN_LABELS[source] ?? 'Staff';
}

const byCreatedDesc = (a: { createdAt: string }, b: { createdAt: string }): number =>
  b.createdAt.localeCompare(a.createdAt);

export interface GroupedFiles {
  documents: PropertyFileResponse[];
  reports: PropertyFileResponse[];
  other: PropertyFileResponse[];
}

/**
 * Split the non-issue files into their subtab buckets, newest first. ISSUE-type
 * files are intentionally omitted here: they surface inside their issue card, not
 * in a flat list.
 */
export function groupNonIssueFiles(files: PropertyFileResponse[]): GroupedFiles {
  const documents: PropertyFileResponse[] = [];
  const reports: PropertyFileResponse[] = [];
  const other: PropertyFileResponse[] = [];
  for (const file of files) {
    if (file.type === PropertyFileType.DOCUMENT) documents.push(file);
    else if (file.type === PropertyFileType.REPORT) reports.push(file);
    else if (file.type === PropertyFileType.OTHER) other.push(file);
  }
  documents.sort(byCreatedDesc);
  reports.sort(byCreatedDesc);
  other.sort(byCreatedDesc);
  return { documents, reports, other };
}

export function sortIssuesNewestFirst(issues: PropertyIssueResponse[]): PropertyIssueResponse[] {
  return [...issues].sort(byCreatedDesc);
}

export interface SubtabCounts {
  issues: number;
  documents: number;
  reports: number;
  other: number;
  total: number;
}

/**
 * Per-subtab counts (C.9). The Issues count is the number of issues (grouped
 * reason+photos), not the number of ISSUE-type files; the other three come from
 * the grouped files so the badge always equals what the subtab renders.
 */
export function subtabCounts(issues: PropertyIssueResponse[], grouped: GroupedFiles): SubtabCounts {
  const issuesCount = issues.length;
  const documents = grouped.documents.length;
  const reports = grouped.reports.length;
  const other = grouped.other.length;
  return {
    issues: issuesCount,
    documents,
    reports,
    other,
    total: issuesCount + documents + reports + other,
  };
}

/**
 * Label for an issue card's photo area. The inspector list returns only READY
 * photos with no "was purged" signal, so an empty set reads as "No photos"
 * (the "Photo removed (retention)" distinction in D27 is web-only, where the
 * card has the fuller history).
 */
export function issuePhotosLabel(issue: Pick<PropertyIssueResponse, 'photos'>): string | null {
  return issue.photos.length === 0 ? 'No photos' : null;
}
