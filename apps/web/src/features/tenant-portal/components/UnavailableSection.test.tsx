import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantConfirmationStatus } from '@properfy/shared';
import { UnavailableSection } from './UnavailableSection';

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

const mutateAsyncMock = vi.fn();
vi.mock('../hooks/usePortalData', () => ({
  useReportUnavailability: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock('@/components/forms/Textarea', () => ({
  Textarea: ({ value, onChange, 'aria-label': ariaLabel, maxLength }: any) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(e: any) => onChange(e.target.value)}
      maxLength={maxLength}
    />
  ),
}));

const baseAppointment = {
  id: '1',
  code: 'APT-001',
  scheduledDate: '2026-04-01',
  timeSlot: '09:00-12:00',
  propertyAddress: '123 Test St',
  tenantConfirmationStatus: TenantConfirmationStatus.PENDING,
};

describe('UnavailableSection', () => {
  it('renders the report unavailability button', () => {
    render(
      <UnavailableSection
        appointment={baseAppointment as any}
        token="test-token"
        isReadOnly={false}
      />,
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Report Unavailability');
  });

  it('shows already reported state when status is UNAVAILABLE', () => {
    render(
      <UnavailableSection
        appointment={{
          ...baseAppointment,
          tenantConfirmationStatus: TenantConfirmationStatus.UNAVAILABLE,
        } as any}
        token="test-token"
        isReadOnly={false}
      />,
    );

    expect(screen.getByText('Unavailability Reported')).toBeInTheDocument();
  });

  it('shows urgent copy and keeps the action available in read-only mode', () => {
    render(
      <UnavailableSection
        appointment={baseAppointment as any}
        token="test-token"
        isReadOnly={true}
      />,
    );

    expect(screen.getByText(/please report your unavailability below/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Urgent Report: Unavailable' })).toBeEnabled();
  });

  it('renders the additional notes textarea', () => {
    render(
      <UnavailableSection
        appointment={baseAppointment as any}
        token="test-token"
        isReadOnly={false}
      />,
    );

    expect(screen.getByLabelText('Additional notes')).toBeInTheDocument();
  });

  it('calls mutation on button click without tenantNote when empty', async () => {
    mutateAsyncMock.mockResolvedValueOnce({});
    const user = userEvent.setup();

    render(
      <UnavailableSection
        appointment={baseAppointment as any}
        token="test-token"
        isReadOnly={false}
      />,
    );

    await user.click(screen.getByRole('button'));

    expect(mutateAsyncMock).toHaveBeenCalledWith({});
  });

  it('includes tenantNote in mutation when provided', async () => {
    mutateAsyncMock.mockResolvedValueOnce({});
    const user = userEvent.setup();

    render(
      <UnavailableSection
        appointment={baseAppointment as any}
        token="test-token"
        isReadOnly={false}
      />,
    );

    const textarea = screen.getByLabelText('Additional notes');
    await user.type(textarea, 'Emergency came up');
    await user.click(screen.getByRole('button'));

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      tenantNote: 'Emergency came up',
    });
  });
});
