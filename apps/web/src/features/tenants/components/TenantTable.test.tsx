import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantConfirmationStatus } from '@properfy/shared';
import { TenantTable } from './TenantTable';
import type { TenantContact } from '../types';

function makeContact(overrides: Partial<TenantContact> = {}): TenantContact {
  return {
    id: 'tnt-1',
    appointmentId: 'apt-1',
    appointmentCode: 'VIST-001',
    name: 'Ana Silva',
    primaryEmail: 'ana@email.com',
    primaryPhone: '11999999999',
    confirmationStatus: TenantConfirmationStatus.CONFIRMED,
    propertyAddress: 'Rua Augusta, 1200 - Centro, São Paulo',
    appointmentDate: '2026-03-15T14:00:00Z',
    lastActivityAt: '2026-03-14T10:00:00Z',
    createdAt: '2026-03-10T10:00:00Z',
    updatedAt: '2026-03-14T10:00:00Z',
    ...overrides,
  };
}

describe('TenantTable', () => {
  it('renders column headers', () => {
    render(<TenantTable data={[]} />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('E-mail')).toBeInTheDocument();
    expect(screen.getByText('Telefone')).toBeInTheDocument();
    expect(screen.getByText('Confirmação')).toBeInTheDocument();
    expect(screen.getByText('Imóvel')).toBeInTheDocument();
    expect(screen.getByText('Data Vistoria')).toBeInTheDocument();
    expect(screen.getByText('Última Atividade')).toBeInTheDocument();
  });

  it('renders data (name, propertyAddress)', () => {
    const contact = makeContact();
    render(<TenantTable data={[contact]} />);
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Rua Augusta, 1200 - Centro, São Paulo')).toBeInTheDocument();
  });

  it('renders TenantConfirmationStatusChip for status', () => {
    const contact = makeContact({ confirmationStatus: TenantConfirmationStatus.PENDING });
    render(<TenantTable data={[contact]} />);
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('renders em dash for null primaryEmail', () => {
    const contact = makeContact({ primaryEmail: null });
    render(<TenantTable data={[contact]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders em dash for null primaryPhone', () => {
    const contact = makeContact({ primaryPhone: null });
    render(<TenantTable data={[contact]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders em dash for null lastActivityAt', () => {
    const contact = makeContact({ lastActivityAt: null });
    render(<TenantTable data={[contact]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders formatted appointmentDate', () => {
    const contact = makeContact({ appointmentDate: '2026-03-15T14:00:00Z' });
    render(<TenantTable data={[contact]} />);
    expect(screen.getByText('15/03/2026')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<TenantTable data={[]} loading />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<TenantTable data={[]} />);
    expect(screen.getByText('Nenhum registro encontrado')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<TenantTable data={[]} error="Erro de rede" />);
    expect(screen.getByText('Erro de rede')).toBeInTheDocument();
  });

  it('view action calls onView with correct contact', async () => {
    const userEvt = userEvent.setup();
    const onView = vi.fn();
    const contact = makeContact();
    render(<TenantTable data={[contact]} onView={onView} />);
    await userEvt.click(screen.getByLabelText('Visualizar'));
    expect(onView).toHaveBeenCalledWith(contact);
  });
});
