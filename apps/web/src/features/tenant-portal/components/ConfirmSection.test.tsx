import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';
import type { PortalAppointment } from '../types';

const mockMutateAsync = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  }),
}));

vi.mock('../hooks/usePortalData', () => ({
  useConfirmAppointment: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/components/forms/Textarea', () => ({
  Textarea: ({ value, onChange, disabled, 'aria-label': ariaLabel, maxLength }: any) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(e: any) => onChange(e.target.value)}
      disabled={disabled}
      maxLength={maxLength}
    />
  ),
}));

import { ConfirmSection } from './ConfirmSection';

const BASE_APPOINTMENT: PortalAppointment = {
  id: 'apt-1',
  status: AppointmentStatus.SCHEDULED,
  scheduledDate: '2026-04-15',
  timeSlot: '09:00-11:00',
  serviceTypeId: 'svc-1',
  tenantConfirmationStatus: TenantConfirmationStatus.PENDING,
  keyRequired: false,
  meetingLocation: null,
  notes: null,
};

describe('ConfirmSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows confirm prompt when status is PENDING', () => {
    render(
      <ConfirmSection
        appointment={BASE_APPOINTMENT}
        token="tok-1"
        isReadOnly={false}
      />,
    );

    expect(screen.getByText('Confirm Your Attendance')).toBeInTheDocument();
    expect(screen.getByText('Confirm Attendance')).toBeInTheDocument();
  });

  it('shows already confirmed state when status is CONFIRMED', () => {
    render(
      <ConfirmSection
        appointment={{
          ...BASE_APPOINTMENT,
          tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
        }}
        token="tok-1"
        isReadOnly={false}
      />,
    );

    expect(screen.getByText('Attendance Confirmed')).toBeInTheDocument();
    expect(screen.queryByText('Confirm Attendance')).not.toBeInTheDocument();
  });

  it('renders nothing when status is not PENDING or CONFIRMED', () => {
    const { container } = render(
      <ConfirmSection
        appointment={{
          ...BASE_APPOINTMENT,
          tenantConfirmationStatus: TenantConfirmationStatus.UNAVAILABLE,
        }}
        token="tok-1"
        isReadOnly={false}
      />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('shows read-only message when isReadOnly is true', () => {
    render(
      <ConfirmSection
        appointment={BASE_APPOINTMENT}
        token="tok-1"
        isReadOnly={true}
      />,
    );

    expect(screen.getByText(/read-only/)).toBeInTheDocument();
  });

  it('renders the additional notes textarea', () => {
    render(
      <ConfirmSection
        appointment={BASE_APPOINTMENT}
        token="tok-1"
        isReadOnly={false}
      />,
    );

    expect(screen.getByLabelText('Additional notes')).toBeInTheDocument();
    expect(screen.getByText('0/2000 characters')).toBeInTheDocument();
  });

  it('calls mutateAsync on confirm click without tenantNote when empty', async () => {
    mockMutateAsync.mockResolvedValue({});

    render(
      <ConfirmSection
        appointment={BASE_APPOINTMENT}
        token="tok-1"
        isReadOnly={false}
      />,
    );

    fireEvent.click(screen.getByText('Confirm Attendance'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({});
    });
  });

  it('calls mutateAsync with tenantNote when provided', async () => {
    mockMutateAsync.mockResolvedValue({});

    render(
      <ConfirmSection
        appointment={BASE_APPOINTMENT}
        token="tok-1"
        isReadOnly={false}
      />,
    );

    fireEvent.change(screen.getByLabelText('Additional notes'), {
      target: { value: 'Please ring the bell' },
    });
    fireEvent.click(screen.getByText('Confirm Attendance'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        tenantNote: 'Please ring the bell',
      });
    });
  });

  it('shows success state after successful confirmation', async () => {
    mockMutateAsync.mockResolvedValue({});

    render(
      <ConfirmSection
        appointment={BASE_APPOINTMENT}
        token="tok-1"
        isReadOnly={false}
      />,
    );

    fireEvent.click(screen.getByText('Confirm Attendance'));

    // Wait for the confirmed state to appear
    await screen.findByText('Attendance Confirmed');
    expect(mockShowSuccess).toHaveBeenCalledWith('Attendance confirmed successfully.');
  });

  it('shows error on failed confirmation', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Network failure'));

    render(
      <ConfirmSection
        appointment={BASE_APPOINTMENT}
        token="tok-1"
        isReadOnly={false}
      />,
    );

    fireEvent.click(screen.getByText('Confirm Attendance'));

    await vi.waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Network failure');
    });
  });
});
