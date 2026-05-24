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
import { render, screen, fireEvent } from '@testing-library/react';
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
    scheduledDate: '2026-06-01', timeSlot: '09:00-10:00', inspectorName: 'Alice Smith', branchName: 'Sydney',
    clientName: 'Acme Realty', contactName: 'Bob', contactPhone: '+61400000000', contactEmail: 'b@example.com',
    tenantConfirmationStatus: 'PENDING',
  },
  {
    id: UUID_B, code: 'INS-0002', status: 'AWAITING_INSPECTOR', propertyAddress: '456 George St', latitude: -33.9, longitude: 151.3,
    scheduledDate: '2026-06-02', timeSlot: '10:00-11:00', inspectorName: null, branchName: 'Sydney',
    clientName: 'Acme Realty', contactName: 'Carol', contactPhone: null, contactEmail: 'c@example.com',
    tenantConfirmationStatus: 'CONFIRMED',
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
  it('shows note icon with tooltip when hasTenantNote=true', () => {
    const withNote: AppointmentMapItem = {
      ...sampleAppointments[0]!,
      hasTenantNote: true,
      tenantNote: 'Will be home after 3pm',
    };
    renderModal({ appointments: [withNote] });
    const icon = screen.getByTestId('bulk-modal-tenant-note-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('title', 'Will be home after 3pm');
  });

  it('shows fallback tooltip text when hasTenantNote=true but tenantNote is null', () => {
    const withNoteNoText: AppointmentMapItem = {
      ...sampleAppointments[0]!,
      hasTenantNote: true,
      tenantNote: null,
    };
    renderModal({ appointments: [withNoteNoText] });
    const icon = screen.getByTestId('bulk-modal-tenant-note-icon');
    expect(icon).toHaveAttribute('title', 'Tenant left a note');
  });

  it('does not show note icon when hasTenantNote is false or absent', () => {
    renderModal(); // sampleAppointments have no hasTenantNote
    expect(screen.queryByTestId('bulk-modal-tenant-note-icon')).toBeNull();
  });
});
