import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimeSlotConfigPage } from './TimeSlotConfigPage';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'am-1', role: 'AM', tenantId: null },
  }),
}));

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}));

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: () => ({
    options: [],
    isLoading: false,
  }),
}));

vi.mock('../hooks/useTimeSlotAdmin', () => ({
  useTimeSlotList: () => ({
    data: [],
    isLoading: false,
    isError: false,
    errorMessage: null,
    refetch: vi.fn(),
  }),
  useTimeSlotSave: () => ({
    save: vi.fn(),
    isSaving: false,
  }),
  useTimeSlotDelete: () => ({
    remove: vi.fn(),
    isDeleting: false,
  }),
}));

describe('TimeSlotConfigPage', () => {
  it('shows a tenant-selection message and disables creation for AM without tenant selected', () => {
    render(<TimeSlotConfigPage />);

    expect(screen.getByText('Select a tenant to list and manage time slots.')).toBeInTheDocument();
    expect(screen.getByText('Select a tenant to view time slots')).toBeInTheDocument();
    expect(screen.getByLabelText('New Time Slot')).toBeDisabled();
  });
});
