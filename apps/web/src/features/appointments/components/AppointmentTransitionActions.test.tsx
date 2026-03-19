import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppointmentStatus } from '@properfy/shared';
import { AppointmentTransitionActions } from './AppointmentTransitionActions';
import type { AppointmentTransition } from '../types';

const mockTransitions: AppointmentTransition[] = [
  {
    targetStatus: AppointmentStatus.DONE,
    label: 'Mark as Done',
    icon: 'mdi-check-circle',
    variant: 'primary',
    requiresReason: false,
  },
  {
    targetStatus: AppointmentStatus.CANCELLED,
    label: 'Cancel',
    icon: 'mdi-cancel',
    variant: 'danger',
    requiresReason: true,
  },
];

describe('AppointmentTransitionActions', () => {
  it('renders button for each transition', () => {
    render(
      <AppointmentTransitionActions transitions={mockTransitions} onTransition={() => {}} />,
    );
    expect(screen.getByText('Mark as Done')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('click without reason calls onTransition immediately', () => {
    const onTransition = vi.fn();
    render(
      <AppointmentTransitionActions transitions={mockTransitions} onTransition={onTransition} />,
    );
    fireEvent.click(screen.getByText('Mark as Done'));
    expect(onTransition).toHaveBeenCalledWith(AppointmentStatus.DONE);
  });

  it('click with reason opens dialog with reason code dropdown', () => {
    render(
      <AppointmentTransitionActions transitions={mockTransitions} onTransition={() => {}} />,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByLabelText('Reason Code')).toBeInTheDocument();
  });

  it('confirm in dialog calls onTransition with reason code', () => {
    const onTransition = vi.fn();
    render(
      <AppointmentTransitionActions transitions={mockTransitions} onTransition={onTransition} />,
    );
    // Click the "Cancel" transition button (not the dialog Cancel)
    fireEvent.click(screen.getAllByText('Cancel')[0]!);
    // Open the custom dropdown
    fireEvent.click(screen.getByLabelText('Reason Code'));
    // Select first available reason code option
    fireEvent.click(screen.getAllByRole('option')[0]!);
    // Confirm
    fireEvent.click(screen.getByText('Confirm'));
    expect(onTransition).toHaveBeenCalledWith(AppointmentStatus.CANCELLED, 'CLIENT REQUEST', 'CLIENT_REQUEST');
  });

  it('no buttons when transitions is empty', () => {
    const { container } = render(
      <AppointmentTransitionActions transitions={[]} onTransition={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('loading state disables all buttons', () => {
    render(
      <AppointmentTransitionActions transitions={mockTransitions} onTransition={() => {}} loading />,
    );
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('buttons show correct labels', () => {
    render(
      <AppointmentTransitionActions transitions={mockTransitions} onTransition={() => {}} />,
    );
    expect(screen.getByText('Mark as Done')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});
