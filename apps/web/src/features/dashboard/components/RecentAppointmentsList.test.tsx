import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentStatus } from '@properfy/shared';
import { RecentAppointmentsList } from './RecentAppointmentsList';
import type { RecentAppointment } from '../types';

function makeRecentAppointments(): RecentAppointment[] {
  return [
    { id: '1', code: 'VST-001', propertyAddress: 'Rua das Flores, 123', status: AppointmentStatus.DRAFT, scheduledDate: '2026-03-10' },
    { id: '2', code: 'VST-002', propertyAddress: 'Av. Paulista, 456', status: AppointmentStatus.AWAITING_INSPECTOR, scheduledDate: '2026-03-11' },
    { id: '3', code: 'VST-003', propertyAddress: 'Rua Augusta, 789', status: AppointmentStatus.SCHEDULED, scheduledDate: '2026-03-12' },
    { id: '4', code: 'VST-004', propertyAddress: 'Rua Oscar Freire, 321', status: AppointmentStatus.DONE, scheduledDate: '2026-03-13' },
    { id: '5', code: 'VST-005', propertyAddress: 'Alameda Santos, 654', status: AppointmentStatus.CANCELLED, scheduledDate: '2026-03-14' },
  ];
}

describe('RecentAppointmentsList', () => {
  it('renders section title "Vistorias Recentes"', () => {
    render(<RecentAppointmentsList appointments={makeRecentAppointments()} />);
    expect(screen.getByText('Vistorias Recentes')).toBeInTheDocument();
  });

  it('renders appointment codes', () => {
    render(<RecentAppointmentsList appointments={makeRecentAppointments()} />);
    expect(screen.getByText('VST-001')).toBeInTheDocument();
    expect(screen.getByText('VST-002')).toBeInTheDocument();
    expect(screen.getByText('VST-003')).toBeInTheDocument();
    expect(screen.getByText('VST-004')).toBeInTheDocument();
    expect(screen.getByText('VST-005')).toBeInTheDocument();
  });

  it('renders status chips', () => {
    render(<RecentAppointmentsList appointments={makeRecentAppointments()} />);
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
    expect(screen.getByText('Aguardando Inspetor')).toBeInTheDocument();
    expect(screen.getByText('Agendado')).toBeInTheDocument();
    expect(screen.getByText('Concluído')).toBeInTheDocument();
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
  });

  it('renders "Ver todas" link', () => {
    render(<RecentAppointmentsList appointments={makeRecentAppointments()} />);
    expect(screen.getByText('Ver todas')).toBeInTheDocument();
  });

  it('calls onViewAppointment with id when row clicked', async () => {
    const user = userEvent.setup();
    const onViewAppointment = vi.fn();
    render(
      <RecentAppointmentsList
        appointments={makeRecentAppointments()}
        onViewAppointment={onViewAppointment}
      />,
    );

    const rows = screen.getAllByTestId('appointment-row');
    await user.click(rows[2]!);
    expect(onViewAppointment).toHaveBeenCalledWith('3');
  });

  it('calls onViewAll when "Ver todas" clicked', async () => {
    const user = userEvent.setup();
    const onViewAll = vi.fn();
    render(
      <RecentAppointmentsList
        appointments={makeRecentAppointments()}
        onViewAll={onViewAll}
      />,
    );

    await user.click(screen.getByText('Ver todas'));
    expect(onViewAll).toHaveBeenCalled();
  });

  it('renders "Nenhuma vistoria recente" when empty array', () => {
    render(<RecentAppointmentsList appointments={[]} />);
    expect(screen.getByText('Nenhuma vistoria recente')).toBeInTheDocument();
  });
});
