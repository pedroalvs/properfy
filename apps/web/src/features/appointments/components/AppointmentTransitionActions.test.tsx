import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppointmentStatus } from '@properfy/shared';
import { AppointmentTransitionActions } from './AppointmentTransitionActions';
import type { AppointmentTransition } from '../types';

const mockTransitions: AppointmentTransition[] = [
  {
    targetStatus: AppointmentStatus.DONE,
    label: 'Marcar como Concluído',
    icon: 'mdi-check-circle',
    variant: 'primary',
    requiresReason: false,
  },
  {
    targetStatus: AppointmentStatus.CANCELLED,
    label: 'Cancelar',
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
    expect(screen.getByText('Marcar como Concluído')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });

  it('click without reason calls onTransition immediately', () => {
    const onTransition = vi.fn();
    render(
      <AppointmentTransitionActions transitions={mockTransitions} onTransition={onTransition} />,
    );
    fireEvent.click(screen.getByText('Marcar como Concluído'));
    expect(onTransition).toHaveBeenCalledWith(AppointmentStatus.DONE);
  });

  it('click with reason opens dialog', () => {
    render(
      <AppointmentTransitionActions transitions={mockTransitions} onTransition={() => {}} />,
    );
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.getByPlaceholderText('Informe o motivo...')).toBeInTheDocument();
  });

  it('confirm in dialog calls onTransition with reason', () => {
    const onTransition = vi.fn();
    render(
      <AppointmentTransitionActions transitions={mockTransitions} onTransition={onTransition} />,
    );
    fireEvent.click(screen.getByText('Cancelar'));
    fireEvent.change(screen.getByPlaceholderText('Informe o motivo...'), {
      target: { value: 'Motivo teste' },
    });
    fireEvent.click(screen.getByText('Confirmar'));
    expect(onTransition).toHaveBeenCalledWith(AppointmentStatus.CANCELLED, 'Motivo teste');
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
    expect(screen.getByText('Marcar como Concluído')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });
});
