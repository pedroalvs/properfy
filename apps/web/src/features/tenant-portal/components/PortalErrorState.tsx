import { ApiError } from '@/lib/api-error';

interface PortalErrorStateProps {
  error: ApiError | Error;
  onRetry: () => void;
}

function getPortalErrorMessage(error: ApiError | Error): { title: string; message: string } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'PORTAL_TOKEN_INVALID':
      case 'PORTAL_TOKEN_NOT_FOUND':
        return {
          title: 'Invalid Link',
          message: 'This link is invalid or has expired. Please contact the agency for a new link.',
        };
      case 'PORTAL_TOKEN_REVOKED':
        return {
          title: 'Link Revoked',
          message: 'This link has been revoked. Please contact the agency for assistance.',
        };
      case 'PORTAL_TOKEN_EXPIRED':
        return {
          title: 'Link Expired',
          message: 'This link has expired. Please contact the agency if you need to make changes.',
        };
      case 'PORTAL_APPOINTMENT_INACTIVE':
        return {
          title: 'Appointment Inactive',
          message: 'This appointment is no longer active.',
        };
      default:
        break;
    }
    if (error.status === 404) {
      return {
        title: 'Not Found',
        message: 'This link is invalid. Please check the URL and try again.',
      };
    }
    if (error.status >= 500) {
      return {
        title: 'Server Error',
        message: 'Something went wrong. Please try again later.',
      };
    }
    return { title: 'Error', message: error.message };
  }
  return { title: 'Connection Error', message: 'Could not connect to the server. Please check your internet connection.' };
}

export function PortalErrorState({ error, onRetry }: PortalErrorStateProps) {
  const { title, message } = getPortalErrorMessage(error);

  return (
    <div className="rounded bg-card-bg p-8 text-center shadow-sm">
      <i className="mdi mdi-alert-circle-outline mb-3 text-5xl text-error" />
      <h2 className="mb-2 text-lg font-bold text-text-primary">{title}</h2>
      <p className="mb-6 text-sm text-text-secondary">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded bg-real-estate px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 active:brightness-90"
      >
        <i className="mdi mdi-refresh text-base" />
        Try Again
      </button>
    </div>
  );
}
