import type { ImportFileIssue } from '@properfy/shared';
import { InfoBanner } from '@/components/feedback/InfoBanner';

interface ImportFileIssuesProps {
  issues: ImportFileIssue[];
}

/**
 * Renders whole-file import diagnostics — which sheet was read, which columns
 * are missing or unrecognized. The backend owns the sentence; this component
 * owns the structured lists underneath it, because the names are unreadable
 * crammed into a single line in the ErrorState or the snackbar.
 */
export function ImportFileIssues({ issues }: ImportFileIssuesProps) {
  if (issues.length === 0) return null;

  return (
    <div className="space-y-3">
      {issues.map((issue, index) => (
        <InfoBanner
          key={`${issue.code}-${index}`}
          variant={issue.severity === 'error' ? 'error' : 'warning'}
        >
          <div data-testid={`import-file-issue-${issue.code}`}>
            <p className="font-semibold">{issue.message}</p>

            {issue.missingColumns.length > 0 && (
              <div className="mt-2">
                <p className="font-semibold">Missing required columns</p>
                <ul className="ml-4 list-disc">
                  {issue.missingColumns.map((column) => (
                    <li key={column}>{column}</li>
                  ))}
                </ul>
              </div>
            )}

            {issue.foundColumns.length > 0 && (
              <p className="mt-2">
                <span className="font-semibold">Columns found in your file: </span>
                {issue.foundColumns.join(', ')}
              </p>
            )}

            {issue.unknownColumns.length > 0 && (
              <ul className="ml-4 mt-2 list-disc">
                {issue.unknownColumns.map(({ column, suggestion }) => (
                  <li key={column}>
                    &quot;{column}&quot;
                    {suggestion && <> — did you mean &quot;{suggestion}&quot;?</>}
                  </li>
                ))}
              </ul>
            )}

            {issue.sheetsIgnored.length > 0 && (
              <p className="mt-2">
                <span className="font-semibold">Sheets ignored: </span>
                {issue.sheetsIgnored.join(', ')}
              </p>
            )}
          </div>
        </InfoBanner>
      ))}
    </div>
  );
}
