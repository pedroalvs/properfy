import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';
import { AppointmentTable } from './AppointmentTable';
import type { Appointment } from '../types';

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'apt-1',
    code: 'VST-001',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    branchName: 'Filial Centro',
    propertyId: 'prop-1',
    propertyAddress: 'Rua das Flores, 123',
    serviceTypeId: 'svc-1',
    serviceTypeName: 'Vistoria de Entrada',
    status: AppointmentStatus.SCHEDULED,
    tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
    contactName: 'João Silva',
    contactPhone: '11999999999',
    contactEmail: 'joao@email.com',
    inspectorId: 'insp-1',
    inspectorName: 'Carlos Inspetor',
    scheduledDate: '2026-03-20',
    timeSlot: '09:00-12:00',
    keyRequired: false,
    notes: null,
    createdAt: '2026-03-10T10:00:00Z',
    updatedAt: '2026-03-10T10:00:00Z',
    ...overrides,
  };
}

describe('AppointmentTable', () => {
  it('renders column headers', () => {
    render(<AppointmentTable data={[]} />);
    expect(screen.getByText('Código')).toBeInTheDocument();
    expect(screen.getByText('Endereço')).toBeInTheDocument();
    expect(screen.getByText('Inquilino')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Inspetor')).toBeInTheDocument();
    expect(screen.getByText('Data Agendada')).toBeInTheDocument();
  });

  it('renders appointment data in rows', () => {
    const apt = makeAppointment();
    render(<AppointmentTable data={[apt]} />);
    expect(screen.getByText('VST-001')).toBeInTheDocument();
    expect(screen.getByText('Rua das Flores, 123')).toBeInTheDocument();
    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('Carlos Inspetor')).toBeInTheDocument();
  });

  it('renders AppointmentStatusChip for status column', () => {
    const apt = makeAppointment({ status: AppointmentStatus.DONE });
    render(<AppointmentTable data={[apt]} />);
    expect(screen.getByText('Concluído')).toBeInTheDocument();
  });

  it('renders em dash for null inspectorName', () => {
    const apt = makeAppointment({ inspectorId: null, inspectorName: null });
    render(<AppointmentTable data={[apt]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('formats date in pt-BR', () => {
    const apt = makeAppointment({ scheduledDate: '2026-03-20T12:00:00Z' });
    render(<AppointmentTable data={[apt]} />);
    expect(screen.getByText('20/03/2026')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<AppointmentTable data={[]} loading />);
    expect(screen.queryByText('Código')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<AppointmentTable data={[]} />);
    expect(screen.getByText('Nenhum registro encontrado')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<AppointmentTable data={[]} error="Erro de rede" />);
    expect(screen.getByText('Erro de rede')).toBeInTheDocument();
  });

  it('view action calls onView with correct appointment', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const apt = makeAppointment();
    render(<AppointmentTable data={[apt]} onView={onView} />);
    await user.click(screen.getByLabelText('Visualizar'));
    expect(onView).toHaveBeenCalledWith(apt);
  });

  it('edit action calls onEdit with correct appointment', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const apt = makeAppointment();
    render(<AppointmentTable data={[apt]} onEdit={onEdit} />);
    await user.click(screen.getByLabelText('Editar'));
    expect(onEdit).toHaveBeenCalledWith(apt);
  });
});
