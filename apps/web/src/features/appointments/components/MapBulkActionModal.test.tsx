/**
 * MapBulkActionModal (025 §FR-411..460) — pins the three guarantees the
 * spec calls out explicitly:
 *  1. Default UNCHECKED — opening the modal does NOT auto-select rows.
 *  2. Footer state matrix flips when at least one row is checked.
 *  3. NO raw UUIDs in the DOM — every cell that displays an appointment
 *     uses the AppointmentCodePill / human-readable label (per the
 *     plan's "UUID-not-rendered assertion").
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MapBulkActionModal } from './MapBulkActionModal';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

// Mock the bulk hooks so the form steps never actually call the API.
vi.mock('../hooks/useBulkCancelAppointments', () => ({
  useBulkCancelAppointments: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/useBulkRescheduleAppointments', () => ({
  useBulkRescheduleAppointments: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/useBulkStatusTransition', () => ({
  useBulkStatusTransition: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/useBulkAssignInspector', () => ({
  useBulkAssignInspector: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/useBulkResendReminder', () => ({
  useBulkResendReminder: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: () => ({ options: [] }),
}));

const UUID_A = 'aaaaaaaa-0000-4000-8000-000000000010';
const UUID_B = 'bbbbbbbb-0000-4000-8000-000000000020';

const sampleAppointments: AppointmentMapItem[] = [
  {
    id: UUID_A, code: 'INS-0001', status: 'DRAFT', propertyAddress: '123 Pitt St', latitude: -33.8, longitude: 151.2,
    scheduledDate: '2026-06-01', timeSlotStart: '09:00', timeSlotEnd: '10:00', inspectorName: 'Alice Smith', branchName: 'Sydney',
    clientName: 'Acme Realty', contactName: 'Bob', contactPhone: '+61400000000', contactEmail: 'b@example.com',
    rentalTenantConfirmationStatus: 'PENDING',
  },
  {
    id: UUID_B, code: 'INS-0002', status: 'AWAITING_INSPECTOR', propertyAddress: '456 George St', latitude: -33.9, longitude: 151.3,
    scheduledDate: '2026-06-02', timeSlotStart: '10:00', timeSlotEnd: '11:00', inspectorName: null, branchName: 'Sydney',
    clientName: 'Acme Realty', contactName: 'Carol', contactPhone: null, contactEmail: 'c@example.com',
    rentalTenantConfirmationStatus: 'CONFIRMED',
  },
];

function renderModal(overrides: Partial<Parameters<typeof MapBulkActionModal>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MapBulkActionModal
          appointments={sampleAppointments}
          open
          onClose={vi.fn()}
          actorRole="OP"
          onAddToGroup={vi.fn()}
          onCreateGroup={vi.fn()}
          {...overrides}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Like renderModal but keeps a stable provider/router wrapper so the modal
 * component INSTANCE survives a rerender — letting us assert that changing
 * `externalSelectedIds` re-seeds the existing selection (not a remount).
 */
function renderTree(props: Partial<Parameters<typeof MapBulkActionModal>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const ui = (p: Partial<Parameters<typeof MapBulkActionModal>[0]>) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MapBulkActionModal
          appointments={sampleAppointments}
          open
          onClose={vi.fn()}
          actorRole="OP"
          onAddToGroup={vi.fn()}
          onCreateGroup={vi.fn()}
          {...p}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(ui(props));
  return { ...result, rerenderWith: (p: Partial<Parameters<typeof MapBulkActionModal>[0]>) => result.rerender(ui(p)) };
}

describe('MapBulkActionModal', () => {
  it('defaults to UNCHECKED — no row checkboxes are ticked on open', () => {
    renderModal();
    const rowCheckboxes = sampleAppointments.map((a) => screen.getByTestId(`bulk-modal-row-${a.code}`) as HTMLInputElement);
    rowCheckboxes.forEach((cb) => expect(cb.checked).toBe(false));
    expect((screen.getByTestId('bulk-modal-select-all') as HTMLInputElement).checked).toBe(false);
  });

  it('footer state matrix flips from "Select rows…" to "N of M selected"', () => {
    renderModal();
    const footer = screen.getByTestId('bulk-modal-footer');
    expect(footer.textContent).toContain('Select rows to enable actions');

    fireEvent.click(screen.getByTestId(`bulk-modal-row-${sampleAppointments[0]!.code}`));
    expect(footer.textContent).toContain('1 of 2 selected');
  });

  it('does NOT render raw UUIDs anywhere in the modal DOM', () => {
    const { container } = renderModal();
    const html = container.innerHTML;
    expect(html).not.toContain(UUID_A);
    expect(html).not.toContain(UUID_B);
    // Sanity: the human-readable codes ARE there.
    expect(html).toContain('INS-0001');
    expect(html).toContain('INS-0002');
  });

  /**
   * T-C4-5 — Cycle 4 invariant override (2nd override; 1st was the eager-fetch in cycle 2).
   * Cycle 2 pinned "buttons visible+disabled at 0 checked". User requested full hide
   * at 0 selected in cycle 4 user browser smoke. Replacing the old test with the new
   * "hidden at 0, visible at ≥1" expectation.
   */
  it('hides all 3 action buttons when 0 rows are checked; shows them once at least 1 is checked', () => {
    renderModal();
    // At 0 checked — all 3 footer buttons must be absent from the DOM.
    expect(screen.queryByTestId('bulk-actions-toggle')).toBeNull();
    expect(screen.queryByTestId('bulk-modal-footer-add-to-group')).toBeNull();
    expect(screen.queryByTestId('bulk-modal-footer-create-group')).toBeNull();

    // Check one row — all 3 buttons must appear.
    fireEvent.click(screen.getByTestId(`bulk-modal-row-${sampleAppointments[0]!.code}`));
    expect(screen.getByTestId('bulk-actions-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-modal-footer-add-to-group')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-modal-footer-create-group')).toBeInTheDocument();
  });

  it('T-C4-1: disables Add/Create group when selection contains a non-groupable status', () => {
    const doneAppointment: AppointmentMapItem = {
      ...sampleAppointments[0]!,
      id: 'cccccccc-0000-4000-8000-000000000030',
      code: 'INS-0003',
      status: 'DONE',
    };
    renderModal({ appointments: [...sampleAppointments, doneAppointment] });

    // Select only the DONE row
    fireEvent.click(screen.getByTestId(`bulk-modal-row-${doneAppointment.code}`));

    // Buttons appear (≥1 checked) but must be disabled with status reason
    const addBtn = screen.getByTestId('bulk-modal-footer-add-to-group') as HTMLButtonElement;
    const createBtn = screen.getByTestId('bulk-modal-footer-create-group') as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
    expect(createBtn.disabled).toBe(true);
    expect(addBtn.title).toContain('cannot be grouped');
  });

  it('shows the empty-state hint instead of the table when no rows are passed', () => {
    renderModal({ appointments: [] });
    expect(screen.getByText(/No appointments inside the lasso/)).toBeInTheDocument();
  });

  // T-C7 — tenant note icon in Confirm column
  it('shows note icon with tooltip when hasRentalTenantNote=true', () => {
    const withNote: AppointmentMapItem = {
      ...sampleAppointments[0]!,
      hasRentalTenantNote: true,
      rentalTenantNote: 'Will be home after 3pm',
    };
    renderModal({ appointments: [withNote] });
    const icon = screen.getByTestId('bulk-modal-tenant-note-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('aria-label', 'Note: Will be home after 3pm');
  });

  it('shows fallback tooltip text when hasRentalTenantNote=true but rentalTenantNote is null', () => {
    const withNoteNoText: AppointmentMapItem = {
      ...sampleAppointments[0]!,
      hasRentalTenantNote: true,
      rentalTenantNote: null,
    };
    renderModal({ appointments: [withNoteNoText] });
    const icon = screen.getByTestId('bulk-modal-tenant-note-icon');
    expect(icon).toHaveAttribute('aria-label', 'Tenant left a note via portal');
  });

  // group button blocking — new behaviors added in fix/group-creation
  it('disables group buttons and shows inline warning when selection has mixed service types', () => {
    const apptA: AppointmentMapItem = { ...sampleAppointments[0]!, serviceTypeId: 'aaaa0000-0000-4000-8000-000000000001' };
    const apptB: AppointmentMapItem = { ...sampleAppointments[1]!, serviceTypeId: 'bbbb0000-0000-4000-8000-000000000002' };
    renderModal({ appointments: [apptA, apptB] });

    fireEvent.click(screen.getByTestId(`bulk-modal-row-${apptA.code}`));
    fireEvent.click(screen.getByTestId(`bulk-modal-row-${apptB.code}`));

    const createBtn = screen.getByTestId('bulk-modal-footer-create-group') as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
    expect(screen.getByTestId('group-button-reason').textContent).toContain('same service type');
  });

  it('disables group buttons and shows inline warning when an appointment already belongs to a group', () => {
    const alreadyGrouped: AppointmentMapItem = {
      ...sampleAppointments[0]!,
      serviceGroupId: 'gggg0000-0000-4000-8000-000000000099',
    };
    renderModal({ appointments: [alreadyGrouped] });

    fireEvent.click(screen.getByTestId(`bulk-modal-row-${alreadyGrouped.code}`));

    const createBtn = screen.getByTestId('bulk-modal-footer-create-group') as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
    expect(screen.getByTestId('group-button-reason').textContent).toContain('already belong to a group');
  });

  it('does not show note icon when hasRentalTenantNote is false or absent', () => {
    renderModal(); // sampleAppointments have no hasRentalTenantNote
    expect(screen.queryByTestId('bulk-modal-tenant-note-icon')).toBeNull();
  });

  // Group column — surfaces the service group code so operators can see which
  // group each lassoed appointment belongs to.
  describe('Group column', () => {
    it('renders a "Group" column header', () => {
      renderModal();
      expect(screen.getByRole('columnheader', { name: 'Group' })).toBeInTheDocument();
    });

    it('shows the service group code for a grouped appointment', () => {
      const grouped: AppointmentMapItem = { ...sampleAppointments[0]!, serviceGroupCode: '42' };
      renderModal({ appointments: [grouped] });
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('shows an em-dash in the Group cell for an ungrouped appointment', () => {
      const ungrouped: AppointmentMapItem = { ...sampleAppointments[0]! }; // no serviceGroupCode
      renderModal({ appointments: [ungrouped] });
      const row = screen.getByTestId(`bulk-modal-row-${ungrouped.code}`).closest('tr')!;
      // Group is the 3rd column (checkbox, Code, Group). Assert the dash is in
      // that cell specifically, not just somewhere in the row.
      const groupCell = within(row).getAllByRole('cell')[2]!;
      expect(groupCell).toHaveTextContent('—');
    });
  });

  // ── Group drill-down generalization (title / emptyText / showGroupCreationActions / isLoading) ──

  it('renders a custom title in the header and aria-label, defaulting to "Bulk actions"', () => {
    const { rerender } = renderModal();
    expect(screen.getByTestId('map-bulk-action-modal')).toHaveAttribute('aria-label', 'Bulk actions');
    expect(screen.getByRole('heading', { name: 'Bulk actions' })).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <MapBulkActionModal
            appointments={sampleAppointments}
            open
            onClose={vi.fn()}
            actorRole="OP"
            onAddToGroup={vi.fn()}
            onCreateGroup={vi.fn()}
            title="Sydney CBD batch"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('map-bulk-action-modal')).toHaveAttribute('aria-label', 'Sydney CBD batch');
    expect(screen.getByRole('heading', { name: 'Sydney CBD batch' })).toBeInTheDocument();
  });

  it('overrides the empty-state copy while the default still mentions the lasso', () => {
    renderModal({ appointments: [] });
    expect(screen.getByText(/No appointments inside the lasso/)).toBeInTheDocument();

    renderModal({ appointments: [], emptyText: 'This group has no appointments.' });
    expect(screen.getByText('This group has no appointments.')).toBeInTheDocument();
  });

  it('shows the loading state instead of the empty-state when isLoading and no rows', () => {
    renderModal({ appointments: [], isLoading: true });
    expect(screen.getByTestId('map-modal-loading')).toBeInTheDocument();
    expect(screen.queryByText(/No appointments inside the lasso/)).toBeNull();
  });

  it('shows a retryable error state (over loading/empty) when isError and no rows', () => {
    const onRetry = vi.fn();
    renderModal({ appointments: [], isError: true, isLoading: true, onRetry });
    expect(screen.getByTestId('map-modal-error')).toBeInTheDocument();
    expect(screen.queryByTestId('map-modal-loading')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the Add/Create group footer buttons when showGroupCreationActions is false (group drill-down)', () => {
    renderModal({ showGroupCreationActions: false });
    // Check a row so the action area renders.
    fireEvent.click(screen.getByTestId(`bulk-modal-row-${sampleAppointments[0]!.code}`));
    // Bulk-actions dropdown stays (the group modal still supports bulk actions)…
    expect(screen.getByTestId('bulk-actions-toggle')).toBeInTheDocument();
    // …but the group-creation buttons are gone.
    expect(screen.queryByTestId('bulk-modal-footer-add-to-group')).toBeNull();
    expect(screen.queryByTestId('bulk-modal-footer-create-group')).toBeNull();
  });

  // ── externalSelectedIds — group-modal lasso seed (replace semantics) ──
  // The group drill-down lasso drives the modal's row selection from the map:
  // each completed polygon REPLACES the checked rows with exactly the enclosed
  // appointments. Omitting the prop keeps the uncontrolled default.
  describe('externalSelectedIds (group-modal lasso seed)', () => {
    it('checks exactly the seeded rows when externalSelectedIds is provided', () => {
      renderModal({ externalSelectedIds: [UUID_A] });
      expect((screen.getByTestId(`bulk-modal-row-${sampleAppointments[0]!.code}`) as HTMLInputElement).checked).toBe(true);
      expect((screen.getByTestId(`bulk-modal-row-${sampleAppointments[1]!.code}`) as HTMLInputElement).checked).toBe(false);
    });

    it('REPLACES the selection when externalSelectedIds changes (does not accumulate)', () => {
      const { rerenderWith } = renderTree({ externalSelectedIds: [UUID_A] });
      expect((screen.getByTestId(`bulk-modal-row-${sampleAppointments[0]!.code}`) as HTMLInputElement).checked).toBe(true);

      rerenderWith({ externalSelectedIds: [UUID_B] });
      // A is now UNCHECKED (replaced), B is checked.
      expect((screen.getByTestId(`bulk-modal-row-${sampleAppointments[0]!.code}`) as HTMLInputElement).checked).toBe(false);
      expect((screen.getByTestId(`bulk-modal-row-${sampleAppointments[1]!.code}`) as HTMLInputElement).checked).toBe(true);
    });

    it('still allows manual row toggling after a seed (seed is a starting point, not a lock)', () => {
      renderModal({ externalSelectedIds: [UUID_A, UUID_B] });
      const rowA = screen.getByTestId(`bulk-modal-row-${sampleAppointments[0]!.code}`) as HTMLInputElement;
      expect(rowA.checked).toBe(true);
      fireEvent.click(rowA);
      expect(rowA.checked).toBe(false);
      expect((screen.getByTestId(`bulk-modal-row-${sampleAppointments[1]!.code}`) as HTMLInputElement).checked).toBe(true);
    });

    it('re-applies the seed when the same ids arrive as a NEW array (identical lasso drawn twice)', () => {
      const { rerenderWith } = renderTree({ externalSelectedIds: [UUID_A] });
      const rowA = () => screen.getByTestId(`bulk-modal-row-${sampleAppointments[0]!.code}`) as HTMLInputElement;
      expect(rowA().checked).toBe(true);

      // User manually unchecks A between draws.
      fireEvent.click(rowA());
      expect(rowA().checked).toBe(false);

      // Same enclosed pin, but a fresh lasso → new array reference. Must re-seed.
      rerenderWith({ externalSelectedIds: [UUID_A] });
      expect(rowA().checked).toBe(true);
    });

    it('does not seed anything when externalSelectedIds is omitted (uncontrolled default)', () => {
      renderModal();
      sampleAppointments.forEach((a) =>
        expect((screen.getByTestId(`bulk-modal-row-${a.code}`) as HTMLInputElement).checked).toBe(false),
      );
    });
  });
});
