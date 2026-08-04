import { useState } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { NoPermissionState } from '@/components/feedback/NoPermissionState';
import { Button } from '@/components/ui/Button';
import { StarRating } from '@/components/ui/StarRating';
import { formatInstantDateTime } from '@/lib/format-date';
import { useInspectorSurveys } from '../hooks/useInspectorSurveys';

interface InspectorRatingsTabProps {
  inspectorId: string;
  ratingAvg: number | null;
  ratingCount: number;
}

/**
 * Individual satisfaction responses, newest first.
 *
 * Its own tab rather than a section inside Details: the list is paginated, and a
 * tab lets the query fire only when opened (same reasoning as the availability
 * tab). Visibility is decided by the API — the drawer has no tenant-ownership
 * data, so a 403 renders as a permission state instead of being second-guessed
 * client-side.
 */
export function InspectorRatingsTab({ inspectorId, ratingAvg, ratingCount }: InspectorRatingsTabProps) {
  const [page, setPage] = useState(1);
  const { surveys, total, isLoading, isError, error, refetch } = useInspectorSurveys(
    inspectorId,
    page,
    true,
  );

  if (isLoading) return <LoadingState rows={4} />;

  if (isError) {
    if (error?.status === 403) {
      return <NoPermissionState message="You cannot view individual responses for this inspector." />;
    }
    return (
      <ErrorState
        message={error?.message ?? 'Failed to load ratings'}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 border-b border-border-subtle pb-3">
        <StarRating value={ratingAvg} count={undefined} size="md" showValue />
        {ratingCount > 0 && (
          <span className="text-sm text-text-secondary">
            {`Based on ${ratingCount} ${ratingCount === 1 ? 'response' : 'responses'}`}
          </span>
        )}
      </div>

      {surveys.length === 0 ? (
        <EmptyState
          icon="mdi-star-outline"
          title="No ratings yet"
          description="This inspector has not received any feedback."
        />
      ) : (
        <ul className="space-y-3">
          {surveys.map((survey) => (
            // The appointment code is the only identifier shown — never a raw id.
            <li key={`${survey.appointmentCode}-${survey.submittedAt}`} className="rounded bg-card-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StarRating value={survey.rating} size="sm" showValue />
                  <span className="text-xs font-semibold text-text-secondary">
                    {survey.appointmentCode}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-text-muted">
                  {formatInstantDateTime(survey.submittedAt)}
                </span>
              </div>
              {survey.comment && (
                <p className="mt-1 text-sm text-text-secondary">{survey.comment}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {surveys.length > 0 && surveys.length < total && (
        <Button variant="outlined" onClick={() => setPage((p) => p + 1)}>
          Load more
        </Button>
      )}
    </div>
  );
}
