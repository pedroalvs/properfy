import { formatDateTime } from '@/lib/format-date';

interface ResponseData {
  type: string;
  createdAt: string;
  summary?: string;
}

interface ResponseConfirmationCardProps {
  response: ResponseData;
  onChangeResponse?: () => void;
  isExpired?: boolean;
}

const BORDER_COLORS: Record<string, string> = {
  CONFIRMED: 'border-l-success',
  UNAVAILABLE: 'border-l-warning',
  RESCHEDULE: 'border-l-info',
};

const RESPONSE_LABELS: Record<string, string> = {
  CONFIRMED: 'Confirmed',
  UNAVAILABLE: 'Unavailable',
  RESCHEDULE: 'Reschedule Requested',
};

export function ResponseConfirmationCard({
  response,
  onChangeResponse,
  isExpired = false,
}: ResponseConfirmationCardProps) {
  const borderClass = BORDER_COLORS[response.type] ?? 'border-l-text-muted';
  const label = RESPONSE_LABELS[response.type] ?? response.type;

  return (
    <div
      className={`rounded border-l-4 bg-card-bg p-6 shadow-sm ${borderClass}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-text-primary">{label}</h3>
          <p className="mt-1 text-xs text-text-muted">
            {formatDateTime(response.createdAt)}
          </p>
          {response.summary && (
            <p className="mt-2 text-sm text-text-secondary">
              {response.summary}
            </p>
          )}
        </div>

        {!isExpired && onChangeResponse && (
          <button
            type="button"
            onClick={onChangeResponse}
            className="shrink-0 text-sm font-semibold text-primary hover:underline"
          >
            Change my response
          </button>
        )}
      </div>
    </div>
  );
}
