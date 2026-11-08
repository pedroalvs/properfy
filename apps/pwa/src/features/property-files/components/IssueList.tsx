import { Plus } from 'lucide-react';
import type { PropertyIssueResponse } from '@properfy/shared';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/feedback/EmptyState';
import { IssueCard } from './IssueCard';

interface IssueListProps {
  issues: PropertyIssueResponse[];
  /** When provided, shows the "Report issue" button (US2); omitted = read-only list (US1). */
  onReportIssue?: () => void;
}

/**
 * The Issues subtab: every issue on the appointment (inspector, staff and
 * tenant-portal origins), read-only, plus an optional "Report issue" action. The
 * action is status-independent (FR-022) — its availability is the caller's choice.
 */
export function IssueList({ issues, onReportIssue }: IssueListProps) {
  return (
    <div className="flex flex-col gap-3">
      {onReportIssue && (
        <Button variant="outlined" block onClick={onReportIssue} data-testid="report-issue-button">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Report issue
        </Button>
      )}

      {issues.length === 0 ? (
        <EmptyState title="No issues reported" />
      ) : (
        issues.map((issue) => <IssueCard key={issue.id} issue={issue} />)
      )}
    </div>
  );
}

export type { PropertyIssueResponse };
