import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppointmentBoardPage } from './AppointmentBoardPage';
import type { Appointment } from '../types';
import type { BoardColumn } from '../hooks/useAppointmentBoard';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', name: 'Admin', email: 'a@b.com', role: 'AM', tenantId: null },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// SnackbarProvider renders no toast DOM, so consumers mock the hook directly.
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn() }),
}));

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: () => ({ options: [], isLoading: false }),
}));

vi.mock('../hooks/useBulkResendReminder', () => ({
  useBulkResendReminder: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../hooks/useAppointmentTransition', () => ({
  useAppointmentTransition: () => ({ transition: vi.fn(), isTransitioning: false }),
}));

// Heavy modals are exercised by their own suites; stub them to keep this focused.
vi.mock('../components/AppointmentFormDrawer', () => ({
  AppointmentFormDrawer: () => null,
}));
vi.mock('../components/BulkEditModal', () => ({ BulkEditModal: () => null }));
vi.mock('../components/AssignInspectorModal', () => ({ AssignInspectorModal: () => null }));

const useAppointmentBoardMock = vi.fn();
vi.mock('../hooks/useAppointmentBoard', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAppointmentBoard: () => useAppointmentBoardMock(),
}));

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'apt-1',
    appointmentNumber: 142,
    code: 'INS-0142',
    tenantId: 'tenant-1',
    tenantName: 'Agency',
    branchId: 'branch-1',
    branchName: 'Sydney CBD',
    propertyId: 'prop-1',
    propertyAddress: '21 King St, Sydney NSW 2000',
    serviceTypeId: 'svc-1',
    serviceTypeName: 'Entry Report',
    status: 'AWAITING_INSPECTOR',
    rentalTenantConfirmationStatus: 'PENDING',
    contactName: 'J. Smith',
    contactPhone: null,
    contactEmail: null,
    inspectorId: null,
    inspectorName: null,
    scheduledDate: '2026-08-12',
    timeSlotStart: '09:00',
    timeSlotEnd: '11:00',
    keyRequired: false,
    notes: null,
    isOverdue: false,
    hasRentalTenantNote: false,
    propertyTotalAreaM2: 82,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeColumn(overrides: Partial<BoardColumn> = {}): BoardColumn {
  return {
    status: 'AWAITING_INSPECTOR',
    label: 'Awaiting Inspector',
    items: [],
    total: 0,
    isLoading: false,
    isError: false,
    errorMessage: null,
    hasMore: false,
    loadMore: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

const DEFAULT_COLUMNS: BoardColumn[] = [
  makeColumn({ status: 'AWAITING_INSPECTOR', label: 'Awaiting Inspector', total: 12 }),
  makeColumn({ status: 'SCHEDULED', label: 'Scheduled', total: 34 }),
  makeColumn({ status: 'REJECTED', label: 'Rejected', total: 3 }),
  makeColumn({ status: 'CANCELLED', label: 'Cancelled', total: 8 }),
  makeColumn({ status: 'DONE', label: 'Done', total: 56 }),
];

function setBoard(columns: BoardColumn[] = DEFAULT_COLUMNS, filterOverrides: Record<string, unknown> = {}) {
  const allItems = columns.flatMap((c) => c.items);
  useAppointmentBoardMock.mockReturnValue({
    columns,
    allItems,
    filters: {
      search: '', status: '', rentalTenantConfirmationStatus: '', tenantId: '',
      branchId: '', serviceTypeId: '', startDate: '', endDate: '',
      showCancelled: false, overdueOnly: false,
      ...filterOverrides,
    },
    setFilters: vi.fn(),
    refetchAll: vi.fn(),
  });
}

function renderBoard() {
  return render(
    <MemoryRouter initialEntries={['/appointments/board']}>
      <AppointmentBoardPage />
    </MemoryRouter>,
  );
}

describe('AppointmentBoardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBoard();
  });

  it('renders the five scope columns with their server totals', () => {
    renderBoard();

    for (const [label, total] of [
      ['Awaiting Inspector', '12'],
      ['Scheduled', '34'],
      ['Rejected', '3'],
      ['Cancelled', '8'],
      ['Done', '56'],
    ] as const) {
      const column = screen.getByRole('region', { name: `${label} column` });
      expect(within(column).getByText(label)).toBeInTheDocument();
      expect(within(column).getByText(total)).toBeInTheDocument();
    }
  });

  it('has no Draft column', () => {
    renderBoard();

    expect(screen.queryByRole('region', { name: 'Draft column' })).not.toBeInTheDocument();
  });

  it('tells the user where draft appointments live', () => {
    renderBoard();

    expect(screen.getByText(/Draft appointments are not shown on the board/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view them in the list/i })).toHaveAttribute(
      'href',
      '/appointments',
    );
  });

  it('hides the status and show-cancelled filters but keeps the rest', () => {
    renderBoard();

    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Show cancelled')).not.toBeInTheDocument();

    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmation')).toBeInTheDocument();
    expect(screen.getByLabelText('Period - start')).toBeInTheDocument();
    expect(screen.getByLabelText('Overdue only')).toBeInTheDocument();
  });

  describe('cards', () => {
    it('shows code, service type, date, tenant, address and square metres', () => {
      setBoard([
        makeColumn({ items: [makeAppointment()], total: 1 }),
        ...DEFAULT_COLUMNS.slice(1),
      ]);
      renderBoard();

      expect(screen.getByRole('link', { name: 'INS-0142' })).toBeInTheDocument();
      expect(screen.getByText('Entry Report')).toBeInTheDocument();
      // AU civil date (DD/MM/YYYY) plus the 12-hour wall-clock slot, one line.
      expect(screen.getByText(/12\/08\/2026/)).toBeInTheDocument();
      expect(screen.getByText(/9:00 am – 11:00 am/)).toBeInTheDocument();
      expect(screen.getByText('J. Smith')).toBeInTheDocument();
      expect(screen.getByText('21 King St, Sydney NSW 2000')).toBeInTheDocument();
      expect(screen.getByText('82 m²')).toBeInTheDocument();
    });

    it('omits the m² line when the property has no recorded area', () => {
      setBoard([
        makeColumn({ items: [makeAppointment({ propertyTotalAreaM2: null })], total: 1 }),
        ...DEFAULT_COLUMNS.slice(1),
      ]);
      renderBoard();

      expect(screen.queryByText(/m²/)).not.toBeInTheDocument();
    });

    it('links the code to the appointment detail page', () => {
      setBoard([makeColumn({ items: [makeAppointment()], total: 1 }), ...DEFAULT_COLUMNS.slice(1)]);
      renderBoard();

      expect(screen.getByRole('link', { name: 'INS-0142' })).toHaveAttribute(
        'href',
        '/appointments/apt-1',
      );
    });

    it('offers Assign inspector only on an unassigned awaiting-inspector card', () => {
      setBoard([
        makeColumn({ items: [makeAppointment()], total: 1 }),
        makeColumn({
          status: 'SCHEDULED',
          label: 'Scheduled',
          total: 1,
          items: [
            makeAppointment({ id: 'apt-2', code: 'INS-0143', status: 'SCHEDULED', inspectorId: 'insp-1' }),
          ],
        }),
        ...DEFAULT_COLUMNS.slice(2),
      ]);
      renderBoard();

      expect(
        screen.getByRole('button', { name: /Assign inspector — appointment INS-0142/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Assign inspector — appointment INS-0143/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('drives the bulk bar from cards selected across different columns', () => {
      setBoard([
        makeColumn({ items: [makeAppointment()], total: 1 }),
        makeColumn({
          status: 'SCHEDULED',
          label: 'Scheduled',
          total: 1,
          items: [makeAppointment({ id: 'apt-2', code: 'INS-0143', status: 'SCHEDULED' })],
        }),
        ...DEFAULT_COLUMNS.slice(2),
      ]);
      renderBoard();

      expect(screen.queryByText(/appointments selected/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Select appointment INS-0142'));
      expect(screen.getByText('1 appointment selected')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Select appointment INS-0143'));
      expect(screen.getByText('2 appointments selected')).toBeInTheDocument();
    });

    it('selects every loaded card in a column from its header checkbox', () => {
      setBoard([
        makeColumn({
          total: 2,
          items: [makeAppointment(), makeAppointment({ id: 'apt-2', code: 'INS-0143' })],
        }),
        ...DEFAULT_COLUMNS.slice(1),
      ]);
      renderBoard();

      fireEvent.click(screen.getByLabelText('Select all loaded Awaiting Inspector appointments'));

      expect(screen.getByText('2 appointments selected')).toBeInTheDocument();
    });
  });

  describe('column states', () => {
    it('isolates a failing column so the others still render', () => {
      setBoard([
        makeColumn({ isError: true, errorMessage: 'Upstream exploded' }),
        makeColumn({ status: 'SCHEDULED', label: 'Scheduled', total: 34, items: [makeAppointment({ status: 'SCHEDULED' })] }),
        ...DEFAULT_COLUMNS.slice(2),
      ]);
      renderBoard();

      const failing = screen.getByRole('region', { name: 'Awaiting Inspector column' });
      expect(within(failing).getByText('Could not load Awaiting Inspector')).toBeInTheDocument();
      expect(within(failing).getByText('Upstream exploded')).toBeInTheDocument();

      const healthy = screen.getByRole('region', { name: 'Scheduled column' });
      expect(within(healthy).getByRole('link', { name: 'INS-0142' })).toBeInTheDocument();
    });

    it('lets the user retry just the failing column', () => {
      // apps/web/CLAUDE.md §8.3 — a recoverable error must offer a retry, and
      // retrying one column must not disturb the other four.
      const refetch = vi.fn();
      const otherRefetch = vi.fn();
      setBoard([
        makeColumn({ isError: true, errorMessage: 'Upstream exploded', refetch }),
        makeColumn({ status: 'SCHEDULED', label: 'Scheduled', refetch: otherRefetch }),
        ...DEFAULT_COLUMNS.slice(2),
      ]);
      renderBoard();

      const failing = screen.getByRole('region', { name: 'Awaiting Inspector column' });
      fireEvent.click(within(failing).getByRole('button', { name: /try again/i }));

      expect(refetch).toHaveBeenCalledTimes(1);
      expect(otherRefetch).not.toHaveBeenCalled();
    });

    it('shows a load-more control only while cards remain', () => {
      setBoard([
        makeColumn({ items: [makeAppointment()], total: 40, hasMore: true }),
        ...DEFAULT_COLUMNS.slice(1),
      ]);
      renderBoard();

      const column = screen.getByRole('region', { name: 'Awaiting Inspector column' });
      expect(within(column).getByRole('button', { name: /Load more \(1 of 40\)/ })).toBeInTheDocument();

      const done = screen.getByRole('region', { name: 'Done column' });
      expect(within(done).queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
    });

    it('says the column is simply empty when no filter is applied', () => {
      renderBoard();

      const column = screen.getByRole('region', { name: 'Awaiting Inspector column' });
      expect(within(column).getByText('No awaiting inspector appointments.')).toBeInTheDocument();
    });

    it('blames the filters when a filter is active', () => {
      // "No data yet" and "no results for this filter" are different problems and
      // apps/web/CLAUDE.md §8.4 requires the empty state to distinguish them.
      setBoard(DEFAULT_COLUMNS, { search: 'king' });
      renderBoard();

      const column = screen.getByRole('region', { name: 'Awaiting Inspector column' });
      expect(
        within(column).getByText('No appointments match the current filters.'),
      ).toBeInTheDocument();
    });
  });

  it('offers a way back to the list', () => {
    renderBoard();

    // PageHeader renders a desktop + mobile pair for its actions.
    expect(screen.getAllByRole('button', { name: 'List' }).length).toBeGreaterThan(0);
  });
});
