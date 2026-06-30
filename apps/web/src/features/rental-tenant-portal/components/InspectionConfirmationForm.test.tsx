import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InspectionConfirmationForm } from './InspectionConfirmationForm';
import type { AvailableSlot } from '@properfy/shared';

const SLOT: AvailableSlot = { dayOfWeek: 'MON', start: '09:00', end: '17:00' };

function renderForm(overrides: Partial<React.ComponentProps<typeof InspectionConfirmationForm>> = {}) {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const onUnavailable = vi.fn().mockResolvedValue(undefined);
  render(
    <InspectionConfirmationForm
      onConfirm={onConfirm}
      onUnavailable={onUnavailable}
      {...overrides}
    />,
  );
  return { onConfirm, onUnavailable };
}

describe('InspectionConfirmationForm', () => {
  describe('initial state', () => {
    it('should render Yes and No toggle buttons', () => {
      renderForm();
      expect(screen.getByRole('button', { name: /yes/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /no/i })).toBeTruthy();
    });

    it('should have submit disabled when nothing is selected', () => {
      renderForm();
      expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    });
  });

  describe('§3.2 submit enable rules', () => {
    it('submit enabled when Yes selected (observation empty)', () => {
      renderForm();
      fireEvent.click(screen.getByRole('button', { name: /yes/i }));
      expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
    });

    it('submit enabled when Yes selected (observation filled)', () => {
      renderForm();
      fireEvent.click(screen.getByRole('button', { name: /yes/i }));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'All good' } });
      expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
    });

    it('submit disabled when No selected + observation empty', () => {
      renderForm();
      fireEvent.click(screen.getByRole('button', { name: /no/i }));
      expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    });

    it('submit disabled when No selected + observation filled + 0 slots', () => {
      renderForm();
      fireEvent.click(screen.getByRole('button', { name: /no/i }));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I am away' } });
      expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    });

    it('submit enabled when No selected + observation filled + ≥1 slot', () => {
      renderForm();
      fireEvent.click(screen.getByRole('button', { name: /no/i }));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I am away' } });
      // toggle Mon chip in the WeeklyAvailabilityPicker
      fireEvent.click(screen.getByText('Mon'));
      expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
    });
  });

  describe('No selection UI', () => {
    it('should show amber banner when No is selected', () => {
      renderForm();
      fireEvent.click(screen.getByRole('button', { name: /no/i }));
      expect(screen.getByText(/add a comment/i)).toBeTruthy();
    });

    it('should show WeeklyAvailabilityPicker when No is selected', () => {
      renderForm();
      fireEvent.click(screen.getByRole('button', { name: /no/i }));
      // The picker renders 7 day chips
      expect(screen.getByText('Mon')).toBeTruthy();
      expect(screen.getByText('Sun')).toBeTruthy();
    });

    it('should NOT show WeeklyAvailabilityPicker when Yes is selected', () => {
      renderForm();
      fireEvent.click(screen.getByRole('button', { name: /yes/i }));
      expect(screen.queryByText('Mon')).toBeNull();
    });
  });

  describe('submission', () => {
    it('should call onConfirm with rentalTenantNote when Yes submitted', async () => {
      const { onConfirm } = renderForm();
      fireEvent.click(screen.getByRole('button', { name: /yes/i }));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'All good' } });
      fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('All good'));
    });

    it('should call onConfirm with undefined when Yes submitted with empty note', async () => {
      const { onConfirm } = renderForm();
      fireEvent.click(screen.getByRole('button', { name: /yes/i }));
      fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(undefined));
    });

    it('should call onUnavailable with rentalTenantNote and slots when No submitted', async () => {
      const { onUnavailable } = renderForm();
      fireEvent.click(screen.getByRole('button', { name: /no/i }));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Away' } });
      fireEvent.click(screen.getByText('Mon'));
      fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      await waitFor(() =>
        expect(onUnavailable).toHaveBeenCalledWith({
          rentalTenantNote: 'Away',
          availableSlotsJson: [SLOT],
        }),
      );
    });
  });

  describe('success states', () => {
    it('should show confirmed card after onConfirm resolves', async () => {
      renderForm();
      fireEvent.click(screen.getByRole('button', { name: /yes/i }));
      fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      await screen.findByText(/attendance confirmed/i);
    });

    it('should show unavailability card after onUnavailable resolves', async () => {
      renderForm();
      fireEvent.click(screen.getByRole('button', { name: /no/i }));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Away' } });
      fireEvent.click(screen.getByText('Mon'));
      fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      await screen.findByText(/unavailability reported/i);
    });
  });

  describe('disabled / read-only state', () => {
    it('should disable Yes/No buttons when isReadOnly is true', () => {
      renderForm({ isReadOnly: true });
      expect(screen.getByRole('button', { name: /yes/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /no/i })).toBeDisabled();
    });
  });
});
