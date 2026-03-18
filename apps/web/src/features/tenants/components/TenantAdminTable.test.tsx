import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantAdminTable } from './TenantAdminTable';
import type { TenantAdmin } from '../types';

function makeTenant(overrides: Partial<TenantAdmin> = {}): TenantAdmin {
  return {
    id: 'ten-1',
    name: 'Imob Alpha',
    legalName: 'Alpha LTDA',
    status: 'ACTIVE',
    branchCount: 3,
    timezone: 'America/Sao_Paulo',
    currency: 'BRL',
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('TenantAdminTable', () => {
  it('renders column headers', () => {
    render(<TenantAdminTable data={[]} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Legal Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Branches')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('renders data (name, legalName, branchCount)', () => {
    const tenant = makeTenant();
    render(<TenantAdminTable data={[tenant]} />);
    expect(screen.getByText('Imob Alpha')).toBeInTheDocument();
    expect(screen.getByText('Alpha LTDA')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders TenantStatusChip for status', () => {
    const tenant = makeTenant({ status: 'PENDING' });
    render(<TenantAdminTable data={[tenant]} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders em dash for null legalName', () => {
    const tenant = makeTenant({ legalName: null });
    render(<TenantAdminTable data={[tenant]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders formatted createdAt date', () => {
    const tenant = makeTenant({ createdAt: '2026-01-15T10:00:00Z' });
    render(<TenantAdminTable data={[tenant]} />);
    expect(screen.getByText('15/01/2026')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<TenantAdminTable data={[]} />);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<TenantAdminTable data={[]} loading />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<TenantAdminTable data={[]} error="Network error" />);
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('view action calls onView with correct tenant', async () => {
    const userEvt = userEvent.setup();
    const onView = vi.fn();
    const tenant = makeTenant();
    render(<TenantAdminTable data={[tenant]} onView={onView} />);
    await userEvt.click(screen.getByLabelText('View'));
    expect(onView).toHaveBeenCalledWith(tenant);
  });
});
