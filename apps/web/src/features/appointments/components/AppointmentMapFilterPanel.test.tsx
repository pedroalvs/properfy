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
    DRAFT: { bg: '#E1BEE7', text: '#000', label: 'Draft' },
    PUBLISHED: { bg: '#FFE0B2', text: '#000', label: 'Awaiting Inspector' },
    ACCEPTED: { bg: '#C8E6C9', text: '#000', label: 'Accepted' },
    CANCELLED: { bg: '#FFCDD2', text: '#000', label: 'Canceled' },
    REJECTED: { bg: '#FFAB91', text: '#000', label: 'Rejected' },
  },
  RENTAL_TENANT_CONFIRMATION_STATUS_MAP: {
    PENDING: { bg: '#FFE0B2', text: '#000', label: 'Pending' },
    CONFIRMED: { bg: '#C8E6C9', text: '#000', label: 'Confirmed' },
    UNAVAILABLE: { bg: '#FFCDD2', text: '#000', label: 'Unavailable' },
    NO_RESPONSE: { bg: '#EEEEEE', text: '#000', label: 'No Response' },
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
    expect(screen.getByLabelText('Confirmation Email')).toBeInTheDocument();
    expect(screen.getByText('Show grouped appointments')).toBeInTheDocument();
  });

  it('shows group mode filters when mode is groups', () => {
    renderPanel({ mode: 'groups' });
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.queryByText('Show grouped appointments')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Confirmation Email')).not.toBeInTheDocument();
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
    const draftGroup = screen.getByRole('button', { name: 'Draft' });
    const awaitingInspector = screen.getByRole('button', { name: 'Awaiting Inspector' });
    const accepted = screen.getByRole('button', { name: 'Accepted' });
    const canceled = screen.getByRole('button', { name: 'Canceled' });

    expect(draftGroup.getAttribute('aria-pressed')).toBe('true');
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

  // FIX 3 — the "Groups" mode is an AM/OP-only surface (it reads
  // /v1/service-groups and its List view goes to /service-groups, both
  // AM/OP-gated). Client roles must not see the toggle at all, otherwise
  // they reach a 403 dead-end.
  describe('Groups mode RBAC gating', () => {
    it('hides the Groups mode option for CL_USER', () => {
      renderPanel({ actorRole: 'CL_USER' });
      expect(screen.queryByRole('tab', { name: 'Groups' })).toBeNull();
      expect(screen.getByRole('tab', { name: 'Appointments' })).toBeInTheDocument();
    });

    it('hides the Groups mode option for CL_ADMIN', () => {
      renderPanel({ actorRole: 'CL_ADMIN' });
      expect(screen.queryByRole('tab', { name: 'Groups' })).toBeNull();
    });

    it('shows the Groups mode option for AM', () => {
      renderPanel({ actorRole: 'AM' });
      expect(screen.getByRole('tab', { name: 'Groups' })).toBeInTheDocument();
    });

    it('shows the Groups mode option for OP', () => {
      renderPanel({ actorRole: 'OP' });
      expect(screen.getByRole('tab', { name: 'Groups' })).toBeInTheDocument();
    });
  });

  describe('Agencies filter RBAC gating', () => {
    const tenantOptions = [{ label: 'Agency A', value: 'tenant-a' }];

    it('shows the Agencies filter for AM', () => {
      renderPanel({ actorRole: 'AM', tenantOptions });
      expect(screen.getByLabelText('Agencies')).toBeInTheDocument();
    });

    it('shows the Agencies filter for OP', () => {
      renderPanel({ actorRole: 'OP', tenantOptions });
      expect(screen.getByLabelText('Agencies')).toBeInTheDocument();
    });

    it('hides the Agencies filter for CL_ADMIN', () => {
      renderPanel({ actorRole: 'CL_ADMIN', tenantOptions });
      expect(screen.queryByLabelText('Agencies')).toBeNull();
    });
  });

  describe('Inspector filter', () => {
    const inspectorOptions = [{ label: 'Jane Inspector', value: 'insp-1' }];

    it('renders the Inspector select when options are provided', () => {
      renderPanel({ inspectorOptions });
      expect(screen.getByLabelText('Inspector')).toBeInTheDocument();
    });

    it('hides the Inspector select without options', () => {
      renderPanel();
      expect(screen.queryByLabelText('Inspector')).toBeNull();
    });

    it('emits inspectorId on selection', () => {
      const onChange = vi.fn();
      renderPanel({ inspectorOptions, onAppointmentFiltersChange: onChange });
      fireEvent.click(screen.getByLabelText('Inspector'));
      fireEvent.click(screen.getByText('Jane Inspector'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ inspectorId: 'insp-1' }),
      );
    });
  });

  describe('Tenant Confirmation filter', () => {
    it('renders one chip per confirmation status, none selected by default', () => {
      renderPanel();
      for (const label of ['Confirmed', 'Pending', 'Unavailable', 'No Response']) {
        const chip = screen.getByRole('button', { name: label });
        expect(chip.getAttribute('aria-pressed')).toBe('false');
      }
    });

    it('toggles a confirmation status on click', () => {
      const onChange = vi.fn();
      renderPanel({ onAppointmentFiltersChange: onChange });
      fireEvent.click(screen.getByRole('button', { name: 'Confirmed' }));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ rentalTenantConfirmationStatuses: ['CONFIRMED'] }),
      );
    });

    it('is not rendered in groups mode', () => {
      renderPanel({ mode: 'groups' });
      expect(screen.queryByText('Tenant Confirmation')).toBeNull();
    });
  });
});
