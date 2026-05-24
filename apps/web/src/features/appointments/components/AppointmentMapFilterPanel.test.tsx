import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AppointmentMapFilterPanel,
  DEFAULT_APPOINTMENT_FILTERS,
  DEFAULT_GROUP_FILTERS,
} from './AppointmentMapFilterPanel';

vi.mock('@/lib/status-colors', () => ({
  APPOINTMENT_STATUS_MAP: {
    DRAFT: { bg: '#E1BEE7', text: '#000', label: 'Draft' },
    AWAITING_INSPECTOR: { bg: '#FFE0B2', text: '#000', label: 'Awaiting Inspector' },
    SCHEDULED: { bg: '#B3E5FC', text: '#000', label: 'Scheduled' },
    DONE: { bg: '#C8E6C9', text: '#000', label: 'Done' },
    CANCELLED: { bg: '#FFCDD2', text: '#000', label: 'Cancelled' },
    REJECTED: { bg: '#FFAB91', text: '#000', label: 'Rejected' },
  },
  SERVICE_GROUP_STATUS_MAP: {
    DRAFT: { bg: '#E1BEE7', text: '#000', label: 'Awaiting Host' },
    PUBLISHED: { bg: '#FFE0B2', text: '#000', label: 'Awaiting Inspector' },
    ACCEPTED: { bg: '#C8E6C9', text: '#000', label: 'Accepted' },
    CANCELLED: { bg: '#FFCDD2', text: '#000', label: 'Canceled' },
    REJECTED: { bg: '#FFAB91', text: '#000', label: 'Rejected' },
  },
}));

function renderPanel(overrides = {}) {
  const defaultProps = {
    mode: 'appointments' as const,
    onModeChange: vi.fn(),
    appointmentFilters: DEFAULT_APPOINTMENT_FILTERS,
    onAppointmentFiltersChange: vi.fn(),
    groupFilters: DEFAULT_GROUP_FILTERS,
    onGroupFiltersChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<AppointmentMapFilterPanel {...defaultProps} />), props: defaultProps };
}

describe('AppointmentMapFilterPanel', () => {
  it('renders filter panel with mode selector', () => {
    renderPanel();
    expect(screen.getByTestId('map-filter-panel')).toBeInTheDocument();
    expect(screen.getByLabelText('Mode')).toBeInTheDocument();
  });

  it('shows appointment mode filters by default', () => {
    renderPanel();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmation')).toBeInTheDocument();
    expect(screen.getByText('Show grouped appointments')).toBeInTheDocument();
  });

  it('shows group mode filters when mode is groups', () => {
    renderPanel({ mode: 'groups' });
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.queryByText('Show grouped appointments')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Confirmation')).not.toBeInTheDocument();
  });

  it('appointment mode shows correct default status selections', () => {
    renderPanel();
    const draftButton = screen.getByRole('button', { name: 'Draft' });
    const rejectedButton = screen.getByRole('button', { name: 'Rejected' });
    expect(draftButton.getAttribute('aria-pressed')).toBe('true');
    expect(rejectedButton.getAttribute('aria-pressed')).toBe('true');

    const scheduledButton = screen.getByRole('button', { name: 'Scheduled' });
    expect(scheduledButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('group mode shows correct default status selections', () => {
    renderPanel({ mode: 'groups' });
    const awaitingHost = screen.getByRole('button', { name: 'Awaiting Host' });
    const awaitingInspector = screen.getByRole('button', { name: 'Awaiting Inspector' });
    const accepted = screen.getByRole('button', { name: 'Accepted' });
    const canceled = screen.getByRole('button', { name: 'Canceled' });

    expect(awaitingHost.getAttribute('aria-pressed')).toBe('true');
    expect(awaitingInspector.getAttribute('aria-pressed')).toBe('true');
    expect(accepted.getAttribute('aria-pressed')).toBe('true');
    expect(canceled.getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles status on click', () => {
    const onChange = vi.fn();
    renderPanel({ onAppointmentFiltersChange: onChange });

    fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        statuses: expect.arrayContaining(['DRAFT', 'REJECTED', 'SCHEDULED']),
      }),
    );
  });

  // Cycle 5 T-C5-3 (commit ae45bb1) removed the internal collapse toggle:
  // the floating filter panel is now expanded/collapsed by the external
  // MapFilterToggleButton, not by an in-panel chevron. The previous
  // "can collapse and expand" assertion has nothing to query and is
  // intentionally retired.

  it('shows date range filter', () => {
    renderPanel();
    expect(screen.getByLabelText('Date Range - start')).toBeInTheDocument();
    expect(screen.getByLabelText('Date Range - end')).toBeInTheDocument();
  });
});
