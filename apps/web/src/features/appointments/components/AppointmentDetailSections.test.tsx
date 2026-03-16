import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';
import { AppointmentDetailSections } from './AppointmentDetailSections';
import type { AppointmentDetail } from '../types';

function makeAppointment(overrides: Partial<AppointmentDetail> = {}): AppointmentDetail {
  return {
    id: 'apt-01',
    code: 'VST-001',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    branchName: 'Filial Centro',
    propertyId: 'prop-1',
    propertyAddress: 'Rua das Flores, 123',
    serviceTypeId: 'svc-1',
    serviceTypeName: 'Vistoria de Entrada',
    status: AppointmentStatus.DRAFT,
    tenantConfirmationStatus: TenantConfirmationStatus.CONFIRMED,
    contactName: 'João Silva',
    contactPhone: '11999999999',
    contactEmail: 'joao@email.com',
    inspectorId: 'insp-1',
    inspectorName: 'Carlos Inspetor',
    scheduledDate: '2026-03-25T12:00:00Z',
    timeSlot: '09:00-12:00',
    keyRequired: true,
    notes: 'Observação de teste',
    createdAt: '2026-03-10T10:00:00Z',
    updatedAt: '2026-03-10T10:00:00Z',
    meetingLocation: 'Portaria principal',
    keyLocation: 'Com o zelador',
    cancellationReason: null,
    ...overrides,
  };
}

describe('AppointmentDetailSections', () => {
  it('renders section titles', () => {
    render(<AppointmentDetailSections appointment={makeAppointment()} />);
    expect(screen.getByText('Dados da Vistoria')).toBeInTheDocument();
    expect(screen.getByText('Contato')).toBeInTheDocument();
    expect(screen.getByText('Acesso')).toBeInTheDocument();
  });

  it('renders service type and property address', () => {
    render(<AppointmentDetailSections appointment={makeAppointment()} />);
    expect(screen.getByText('Vistoria de Entrada')).toBeInTheDocument();
    expect(screen.getByText('Rua das Flores, 123')).toBeInTheDocument();
  });

  it('renders contact name, phone, email', () => {
    render(<AppointmentDetailSections appointment={makeAppointment()} />);
    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('11999999999')).toBeInTheDocument();
    expect(screen.getByText('joao@email.com')).toBeInTheDocument();
  });

  it('shows BooleanIcon for keyRequired', () => {
    render(<AppointmentDetailSections appointment={makeAppointment({ keyRequired: true })} />);
    expect(screen.getByLabelText('Sim')).toBeInTheDocument();
  });

  it('shows tenant confirmation status chip', () => {
    render(<AppointmentDetailSections appointment={makeAppointment()} />);
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
  });

  it('shows notes when present', () => {
    render(<AppointmentDetailSections appointment={makeAppointment()} />);
    expect(screen.getByText('Observação de teste')).toBeInTheDocument();
  });

  it('shows em-dash for null inspector', () => {
    render(<AppointmentDetailSections appointment={makeAppointment({ inspectorName: null })} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows cancellation reason when present, hides when null', () => {
    const { rerender } = render(
      <AppointmentDetailSections appointment={makeAppointment({ cancellationReason: null })} />,
    );
    expect(screen.queryByText('Motivo de Cancelamento/Rejeição')).not.toBeInTheDocument();

    rerender(
      <AppointmentDetailSections
        appointment={makeAppointment({ cancellationReason: 'Inquilino cancelou' })}
      />,
    );
    expect(screen.getByText('Motivo de Cancelamento/Rejeição')).toBeInTheDocument();
    expect(screen.getByText('Inquilino cancelou')).toBeInTheDocument();
  });
});
