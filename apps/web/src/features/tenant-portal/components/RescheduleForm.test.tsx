import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  useRescheduleRequest: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

// Mock form components to simplify testing
vi.mock('@/components/forms/FormField', () => ({
  FormField: ({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) => (
    <div>
      <label>{label}</label>
      {children}
      {error && <span role="alert">{error}</span>}
    </div>
  ),
}));

vi.mock('@/components/forms/DateInput', () => ({
  DateInput: ({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) => (
    <input
      type="date"
      aria-label="date-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  ),
}));

vi.mock('@/components/forms/TextInput', () => ({
  TextInput: ({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) => (
    <input
      aria-label="text-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  ),
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

import { RescheduleForm } from './RescheduleForm';

// Use a dynamic scheduledDate (3 days from now) so the 30-day reschedule
// window guard never trips on CI date drift. Tests that submit
// `Date.now() + 7 days` land 4 days after this anchor — comfortably inside
// the window. Avoiding `vi.useFakeTimers` here keeps timer-driven Testing
// Library queries (`findByText`, `waitFor`) on real time so React state
// transitions resolve as expected.
const SCHEDULED_DATE_ANCHOR = new Date(Date.now() + 3 * 24 * 3600 * 1000)
  .toISOString()
  .split('T')[0]!;

const BASE_APPOINTMENT: PortalAppointment = {
  id: 'apt-1',
  status: AppointmentStatus.SCHEDULED,
  scheduledDate: SCHEDULED_DATE_ANCHOR,
  timeSlot: '09:00-11:00',
  serviceTypeId: 'svc-1',
  tenantConfirmationStatus: TenantConfirmationStatus.PENDING,
  keyRequired: false,
  meetingLocation: null,
  notes: null,
};

describe('RescheduleForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the form title', () => {
    render(
      <RescheduleForm appointment={BASE_APPOINTMENT} token="tok-1" isReadOnly={false} />,
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Request Reschedule');
  });

  it('renders date and time slot fields', () => {
    render(
      <RescheduleForm appointment={BASE_APPOINTMENT} token="tok-1" isReadOnly={false} />,
    );

    expect(screen.getByText('New Date')).toBeInTheDocument();
    expect(screen.getByText('Preferred Time Slot')).toBeInTheDocument();
  });

  it('shows validation errors when submitting empty form', async () => {
    render(
      <RescheduleForm appointment={BASE_APPOINTMENT} token="tok-1" isReadOnly={false} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Request Reschedule/ }));

    expect(await screen.findByText('Please select a new date.')).toBeInTheDocument();
    expect(screen.getByText('Please enter a time slot.')).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows read-only message when isReadOnly is true', () => {
    render(
      <RescheduleForm appointment={BASE_APPOINTMENT} token="tok-1" isReadOnly={true} />,
    );

    expect(screen.getByText(/read-only/)).toBeInTheDocument();
  });

  it('shows success state after successful submission', async () => {
    mockMutateAsync.mockResolvedValue({});

    render(
      <RescheduleForm appointment={BASE_APPOINTMENT} token="tok-1" isReadOnly={false} />,
    );

    // Fill in form fields
    fireEvent.change(screen.getByLabelText('date-input'), {
      target: { value: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0] },
    });
    fireEvent.change(screen.getByLabelText('text-input'), {
      target: { value: '14:00-16:00' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Request Reschedule/ }));

    await screen.findByText('Reschedule Requested');
    expect(mockShowSuccess).toHaveBeenCalledWith('Reschedule request submitted successfully.');
  });

  it('renders the additional notes textarea', () => {
    render(
      <RescheduleForm appointment={BASE_APPOINTMENT} token="tok-1" isReadOnly={false} />,
    );

    expect(screen.getByLabelText('Additional notes')).toBeInTheDocument();
  });

  it('includes tenantNote in submission when provided', async () => {
    mockMutateAsync.mockResolvedValue({});

    render(
      <RescheduleForm appointment={BASE_APPOINTMENT} token="tok-1" isReadOnly={false} />,
    );

    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
    fireEvent.change(screen.getByLabelText('date-input'), {
      target: { value: futureDate },
    });
    fireEvent.change(screen.getByLabelText('text-input'), {
      target: { value: '14:00-16:00' },
    });
    fireEvent.change(screen.getByLabelText('Additional notes'), {
      target: { value: 'I need afternoon slots only' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Request Reschedule/ }));

    await screen.findByText('Reschedule Requested');
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantNote: 'I need afternoon slots only',
      }),
    );
  });

  it('shows error on failed submission', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Server error'));

    render(
      <RescheduleForm appointment={BASE_APPOINTMENT} token="tok-1" isReadOnly={false} />,
    );

    fireEvent.change(screen.getByLabelText('date-input'), {
      target: { value: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0] },
    });
    fireEvent.change(screen.getByLabelText('text-input'), {
      target: { value: '14:00-16:00' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Request Reschedule/ }));

    await vi.waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Server error');
    });
  });
});
