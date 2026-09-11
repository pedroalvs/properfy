import { NoPermissionState } from '@/components/feedback/NoPermissionState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { getErrorMessage, type ApiError } from '@/lib/api-error';

interface ContactLoadErrorProps {
  /** The thrown ApiError from the detail query, or null when the query simply resolved with no contact. */
  error: ApiError | null;
  /** Retry action, wired to the detail hook's refetch. */
  onRetry: () => void;
  /** Optional action for the not-found state (e.g. "Back to Contacts"). */
  notFoundAction?: { label: string; onClick: () => void };
}

/**
 * WI-3 (#206/#201/#213) — status-aware fallback shared by the contact detail
 * surfaces (page, form drawer edit mode, detail drawer) so a failed fetch is
 * never collapsed into "no contact" or a blank/editable panel:
 * - 403 → a permission message (no retry — retrying won't help)
 * - 404 / resolved-with-no-contact → the not-found empty state
 * - anything else (network, 5xx) → a retryable error state
 */
export function ContactLoadError({ error, onRetry, notFoundAction }: ContactLoadErrorProps) {
  if (error?.status === 403) {
    return <NoPermissionState />;
  }
  if (!error || error.status === 404) {
    return (
      <EmptyState
        icon="mdi-account-off-outline"
        title="Contact not found"
        description="This contact does not exist or you do not have permission to view it."
        action={notFoundAction}
      />
    );
  }
  return (
    <ErrorState
      message={getErrorMessage(error, 'Failed to load contact. Please try again.')}
      onRetry={onRetry}
    />
  );
}
