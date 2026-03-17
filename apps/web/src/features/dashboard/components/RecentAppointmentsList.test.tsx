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
  it('renders section title "Recent Appointments"', () => {
    render(<RecentAppointmentsList appointments={makeRecentAppointments()} />);
    expect(screen.getByText('Recent Appointments')).toBeInTheDocument();
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
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Inspector')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders "View all" link', () => {
    render(<RecentAppointmentsList appointments={makeRecentAppointments()} />);
    expect(screen.getByText('View all')).toBeInTheDocument();
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

  it('calls onViewAll when "View all" clicked', async () => {
    const user = userEvent.setup();
    const onViewAll = vi.fn();
    render(
      <RecentAppointmentsList
        appointments={makeRecentAppointments()}
        onViewAll={onViewAll}
      />,
    );

    await user.click(screen.getByText('View all'));
    expect(onViewAll).toHaveBeenCalled();
  });

  it('renders "No recent appointments" when empty array', () => {
    render(<RecentAppointmentsList appointments={[]} />);
    expect(screen.getByText('No recent appointments')).toBeInTheDocument();
  });
});
