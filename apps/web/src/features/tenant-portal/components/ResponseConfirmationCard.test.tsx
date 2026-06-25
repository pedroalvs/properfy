import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResponseConfirmationCard } from './ResponseConfirmationCard';

describe('ResponseConfirmationCard', () => {
  it('renders response type label for CONFIRMED', () => {
    render(
      <ResponseConfirmationCard
        response={{ type: 'CONFIRMED', createdAt: '2026-04-10T10:00:00Z' }}
      />,
    );

    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('renders response type label for UNAVAILABLE', () => {
    render(
      <ResponseConfirmationCard
        response={{ type: 'UNAVAILABLE', createdAt: '2026-04-10T10:00:00Z' }}
      />,
    );

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('renders response type label for RESCHEDULE', () => {
    render(
      <ResponseConfirmationCard
        response={{ type: 'RESCHEDULE', createdAt: '2026-04-10T10:00:00Z' }}
      />,
    );

    expect(screen.getByText('Reschedule Requested')).toBeInTheDocument();
  });

  it('falls back to raw type when unknown', () => {
    render(
      <ResponseConfirmationCard
        response={{ type: 'UNKNOWN_TYPE', createdAt: '2026-04-10T10:00:00Z' }}
      />,
    );

    expect(screen.getByText('UNKNOWN_TYPE')).toBeInTheDocument();
  });

  it('shows formatted timestamp', () => {
    render(
      <ResponseConfirmationCard
        response={{ type: 'CONFIRMED', createdAt: '2026-04-10T10:00:00Z' }}
      />,
    );

    // formatDateTime from lib/format-date uses en-AU locale
    const dateEl = screen.getByText(/10\/04\/2026|4\/10\/2026/);
    expect(dateEl).toBeInTheDocument();
  });

  it('shows summary text when provided', () => {
    render(
      <ResponseConfirmationCard
        response={{
          type: 'CONFIRMED',
          createdAt: '2026-04-10T10:00:00Z',
          summary: 'Tenant confirmed via portal',
        }}
      />,
    );

    expect(
      screen.getByText('Tenant confirmed via portal'),
    ).toBeInTheDocument();
  });

  it('does not show summary when not provided', () => {
    render(
      <ResponseConfirmationCard
        response={{ type: 'CONFIRMED', createdAt: '2026-04-10T10:00:00Z' }}
      />,
    );

    // Only the label and timestamp should be present
    expect(screen.queryByText(/portal/)).not.toBeInTheDocument();
  });

  it('shows "Change my response" button when not expired and handler provided', () => {
    const onChange = vi.fn();
    render(
      <ResponseConfirmationCard
        response={{ type: 'CONFIRMED', createdAt: '2026-04-10T10:00:00Z' }}
        onChangeResponse={onChange}
      />,
    );

    const button = screen.getByText('Change my response');
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('hides "Change my response" button when expired', () => {
    render(
      <ResponseConfirmationCard
        response={{ type: 'CONFIRMED', createdAt: '2026-04-10T10:00:00Z' }}
        onChangeResponse={() => {}}
        isExpired
      />,
    );

    expect(screen.queryByText('Change my response')).not.toBeInTheDocument();
  });

  it('hides "Change my response" button when no handler', () => {
    render(
      <ResponseConfirmationCard
        response={{ type: 'CONFIRMED', createdAt: '2026-04-10T10:00:00Z' }}
      />,
    );

    expect(screen.queryByText('Change my response')).not.toBeInTheDocument();
  });

  it('applies success border color for CONFIRMED', () => {
    const { container } = render(
      <ResponseConfirmationCard
        response={{ type: 'CONFIRMED', createdAt: '2026-04-10T10:00:00Z' }}
      />,
    );

    const card = container.firstElementChild;
    expect(card?.className).toContain('border-l-success');
  });

  it('applies warning border color for UNAVAILABLE', () => {
    const { container } = render(
      <ResponseConfirmationCard
        response={{ type: 'UNAVAILABLE', createdAt: '2026-04-10T10:00:00Z' }}
      />,
    );

    const card = container.firstElementChild;
    expect(card?.className).toContain('border-l-warning');
  });

  it('applies info border color for RESCHEDULE', () => {
    const { container } = render(
      <ResponseConfirmationCard
        response={{ type: 'RESCHEDULE', createdAt: '2026-04-10T10:00:00Z' }}
      />,
    );

    const card = container.firstElementChild;
    expect(card?.className).toContain('border-l-info');
  });
});
