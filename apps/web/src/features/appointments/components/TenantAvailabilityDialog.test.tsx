import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TenantAvailabilityDialog } from './TenantAvailabilityDialog';

const setAvailability = vi.fn();
vi.mock('../hooks/useSetRentalTenantAvailability', () => ({
  useSetRentalTenantAvailability: () => ({ setAvailability, isSaving: false }),
}));

function renderDialog(props: Partial<Parameters<typeof TenantAvailabilityDialog>[0]> = {}) {
  return render(
    <TenantAvailabilityDialog
      open
      appointmentId="aaaaaaaa-0000-4000-8000-000000000010"
      slots={null}
      canMarkUnavailable
      onClose={vi.fn()}
      onSaved={vi.fn()}
      {...props}
    />,
  );
}

/** Picks Monday, which the picker seeds with a 09:00–17:00 window. */
const pickMonday = () => fireEvent.click(screen.getByRole('button', { name: 'Mon' }));

describe('TenantAvailabilityDialog', () => {
  beforeEach(() => setAvailability.mockClear());

  it('will not submit an empty week', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(setAvailability).not.toHaveBeenCalled();
    expect(screen.getByText(/pick at least one day/i)).toBeInTheDocument();
  });

  it('saves the picked slots without touching any status', () => {
    renderDialog();
    pickMonday();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(setAvailability).toHaveBeenCalledWith(
      [{ dayOfWeek: 'MON', start: '09:00', end: '17:00' }],
      false,
    );
  });

  it('survives a background refetch handing back a new array identity', () => {
    // `slots` is React Query data: any refetch produces a fresh array. If the
    // reset effect keyed on it, the operator's half-finished week would be
    // silently replaced by the server value mid-edit.
    const { rerender } = renderDialog({ slots: [] });
    pickMonday();

    rerender(
      <TenantAvailabilityDialog
        open
        appointmentId="aaaaaaaa-0000-4000-8000-000000000010"
        slots={[]} // same content, new identity
        canMarkUnavailable
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(setAvailability).toHaveBeenCalledWith(
      [{ dayOfWeek: 'MON', start: '09:00', end: '17:00' }],
      false,
    );
  });

  it('pre-fills the availability already on the appointment', () => {
    renderDialog({ slots: [{ dayOfWeek: 'WED', start: '10:00', end: '14:00' }] });

    // Editing should start from what the tenant already told us, not a blank week.
    expect(screen.getByTestId('start-WED')).toHaveValue('10:00');
    expect(screen.getByTestId('end-WED')).toHaveValue('14:00');
  });

  describe('the decline checkbox', () => {
    it('asks for confirmation before rejecting the inspection', () => {
      renderDialog();
      pickMonday();
      fireEvent.click(screen.getByLabelText(/also mark tenant as unavailable/i));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      // Nothing may fire until the operator confirms — this rejects the
      // inspection and emails the agency.
      expect(setAvailability).not.toHaveBeenCalled();
      expect(
        screen.getByRole('heading', { name: /reject this inspection/i }),
      ).toBeInTheDocument();
    });

    it('submits with markUnavailable once confirmed', () => {
      renderDialog();
      pickMonday();
      fireEvent.click(screen.getByLabelText(/also mark tenant as unavailable/i));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      fireEvent.click(screen.getByRole('button', { name: /reject and save/i }));

      expect(setAvailability).toHaveBeenCalledWith(
        [{ dayOfWeek: 'MON', start: '09:00', end: '17:00' }],
        true,
      );
    });

    it('states the consequence next to the checkbox, not only in the dialog', () => {
      renderDialog();
      expect(screen.getByText(/rejects the inspection/i)).toBeInTheDocument();
    });

    it('is hidden for a role that may record availability but not reject', () => {
      // CL_ADMIN: the state machine admits only AM/OP/SYS to a REJECTED edge.
      renderDialog({ canMarkUnavailable: false });

      expect(screen.queryByLabelText(/also mark tenant as unavailable/i)).toBeNull();
    });

    it('never sends markUnavailable when the checkbox is unavailable', () => {
      renderDialog({ canMarkUnavailable: false });
      pickMonday();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(setAvailability).toHaveBeenCalledWith(expect.anything(), false);
    });
  });
});
