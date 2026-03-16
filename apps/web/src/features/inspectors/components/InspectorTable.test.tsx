import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InspectorStatus } from '@properfy/shared';
import { InspectorTable } from './InspectorTable';
import type { Inspector } from '../types';

function makeInspector(overrides: Partial<Inspector> = {}): Inspector {
  return {
    id: 'insp-1',
    name: 'Carlos Inspetor',
    email: 'carlos@inspecoes.com',
    phone: '11999999999',
    status: InspectorStatus.ACTIVE,
    regionsCount: 3,
    serviceTypesCount: 5,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z',
    ...overrides,
  };
}

describe('InspectorTable', () => {
  it('renders column headers', () => {
    render(<InspectorTable data={[]} />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('E-mail')).toBeInTheDocument();
    expect(screen.getByText('Telefone')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Regiões')).toBeInTheDocument();
    expect(screen.getByText('Serviços')).toBeInTheDocument();
  });

  it('renders inspector data (name, email, regions/services counts)', () => {
    const insp = makeInspector();
    render(<InspectorTable data={[insp]} />);
    expect(screen.getByText('Carlos Inspetor')).toBeInTheDocument();
    expect(screen.getByText('carlos@inspecoes.com')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders InspectorStatusChip', () => {
    const insp = makeInspector({ status: InspectorStatus.INACTIVE });
    render(<InspectorTable data={[insp]} />);
    expect(screen.getByText('Inativo')).toBeInTheDocument();
  });

  it('renders em dash for null phone', () => {
    const insp = makeInspector({ phone: null });
    render(<InspectorTable data={[insp]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<InspectorTable data={[]} loading />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<InspectorTable data={[]} />);
    expect(screen.getByText('Nenhum registro encontrado')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<InspectorTable data={[]} error="Erro de rede" />);
    expect(screen.getByText('Erro de rede')).toBeInTheDocument();
  });

  it('view action calls onView with correct inspector', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const insp = makeInspector();
    render(<InspectorTable data={[insp]} onView={onView} />);
    await user.click(screen.getByLabelText('Visualizar'));
    expect(onView).toHaveBeenCalledWith(insp);
  });

  it('edit action calls onEdit with correct inspector', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const insp = makeInspector();
    render(<InspectorTable data={[insp]} onEdit={onEdit} />);
    await user.click(screen.getByLabelText('Editar'));
    expect(onEdit).toHaveBeenCalledWith(insp);
  });
});
