import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApiError } from '@/lib/api-error';
import { PortalErrorState } from './PortalErrorState';

describe('PortalErrorState', () => {
  it('shows "Invalid Link" for PORTAL_TOKEN_INVALID code', () => {
    const error = new ApiError(400, 'Token invalid', 'PORTAL_TOKEN_INVALID');
    render(<PortalErrorState error={error} onRetry={vi.fn()} />);

    expect(screen.getByText('Invalid Link')).toBeInTheDocument();
    expect(screen.getByText(/invalid or has expired/)).toBeInTheDocument();
  });

  it('shows "Invalid Link" for PORTAL_TOKEN_NOT_FOUND code', () => {
    const error = new ApiError(404, 'Not found', 'PORTAL_TOKEN_NOT_FOUND');
    render(<PortalErrorState error={error} onRetry={vi.fn()} />);

    expect(screen.getByText('Invalid Link')).toBeInTheDocument();
  });

  it('shows "Link Revoked" for PORTAL_TOKEN_REVOKED code', () => {
    const error = new ApiError(403, 'Revoked', 'PORTAL_TOKEN_REVOKED');
    render(<PortalErrorState error={error} onRetry={vi.fn()} />);

    expect(screen.getByText('Link Revoked')).toBeInTheDocument();
    expect(screen.getByText(/has been revoked/)).toBeInTheDocument();
  });

  it('shows "Link Expired" for PORTAL_TOKEN_EXPIRED code', () => {
    const error = new ApiError(403, 'Expired', 'PORTAL_TOKEN_EXPIRED');
    render(<PortalErrorState error={error} onRetry={vi.fn()} />);

    expect(screen.getByText('Link Expired')).toBeInTheDocument();
    expect(screen.getByText(/has expired/)).toBeInTheDocument();
  });

  it('shows "Appointment Inactive" for PORTAL_APPOINTMENT_INACTIVE code', () => {
    const error = new ApiError(400, 'Inactive', 'PORTAL_APPOINTMENT_INACTIVE');
    render(<PortalErrorState error={error} onRetry={vi.fn()} />);

    expect(screen.getByText('Appointment Inactive')).toBeInTheDocument();
  });

  it('shows "Not Found" for generic 404', () => {
    const error = new ApiError(404, 'Not found');
    render(<PortalErrorState error={error} onRetry={vi.fn()} />);

    expect(screen.getByText('Not Found')).toBeInTheDocument();
  });

  it('shows "Server Error" for 500+ errors', () => {
    const error = new ApiError(503, 'Service unavailable');
    render(<PortalErrorState error={error} onRetry={vi.fn()} />);

    expect(screen.getByText('Server Error')).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
  });

  it('falls back to error message for other ApiErrors', () => {
    const error = new ApiError(422, 'Validation failed');
    render(<PortalErrorState error={error} onRetry={vi.fn()} />);

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Validation failed')).toBeInTheDocument();
  });

  it('shows "Connection Error" for generic Error', () => {
    const error = new Error('Network error');
    render(<PortalErrorState error={error} onRetry={vi.fn()} />);

    expect(screen.getByText('Connection Error')).toBeInTheDocument();
    expect(screen.getByText(/check your internet/)).toBeInTheDocument();
  });

  it('calls onRetry when Try Again is clicked', () => {
    const onRetry = vi.fn();
    const error = new ApiError(500, 'Error');
    render(<PortalErrorState error={error} onRetry={onRetry} />);

    fireEvent.click(screen.getByText('Try Again'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows the alert icon', () => {
    const error = new Error('fail');
    render(<PortalErrorState error={error} onRetry={vi.fn()} />);

    const icon = document.querySelector('.mdi-alert-circle-outline');
    expect(icon).toBeInTheDocument();
  });
});
