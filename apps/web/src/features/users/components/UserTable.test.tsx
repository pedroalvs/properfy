import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRole, UserStatus } from '@properfy/shared';
import { UserTable } from './UserTable';
import type { User } from '../types';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    branchName: 'Filial Centro',
    role: UserRole.CL_ADMIN,
    name: 'Ana Costa',
    email: 'ana@imobiliaria.com',
    phone: '11999999999',
    status: UserStatus.ACTIVE,
    lastLoginAt: '2026-03-10T14:30:00Z',
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-03-10T14:30:00Z',
    ...overrides,
  };
}

describe('UserTable', () => {
  it('renders column headers', () => {
    render(<UserTable data={[]} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Branch')).toBeInTheDocument();
    expect(screen.getByText('Last Login')).toBeInTheDocument();
  });

  it('renders user data (name, email)', () => {
    const user = makeUser();
    render(<UserTable data={[user]} />);
    expect(screen.getByText('Ana Costa')).toBeInTheDocument();
    expect(screen.getByText('ana@imobiliaria.com')).toBeInTheDocument();
  });

  it('renders UserRoleChip for role column', () => {
    const user = makeUser({ role: UserRole.OP });
    render(<UserTable data={[user]} />);
    expect(screen.getByText('Operator')).toBeInTheDocument();
  });

  it('renders UserStatusChip for status column', () => {
    const user = makeUser({ status: UserStatus.LOCKED });
    render(<UserTable data={[user]} />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('renders em dash for null branchName', () => {
    const user = makeUser({ branchName: null });
    render(<UserTable data={[user]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders em dash for null lastLoginAt', () => {
    const user = makeUser({ lastLoginAt: null });
    render(<UserTable data={[user]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders formatted date for lastLoginAt', () => {
    const user = makeUser({ lastLoginAt: '2026-03-10T14:30:00Z' });
    render(<UserTable data={[user]} />);
    expect(screen.getByText('10/03/2026')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<UserTable data={[]} loading />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<UserTable data={[]} />);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<UserTable data={[]} error="Network error" />);
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('view action calls onView with correct user', async () => {
    const userEvt = userEvent.setup();
    const onView = vi.fn();
    const user = makeUser();
    render(<UserTable data={[user]} onView={onView} />);
    await userEvt.click(screen.getByLabelText('View'));
    expect(onView).toHaveBeenCalledWith(user);
  });

  it('edit action calls onEdit with correct user', async () => {
    const userEvt = userEvent.setup();
    const onEdit = vi.fn();
    const user = makeUser();
    render(<UserTable data={[user]} onEdit={onEdit} />);
    await userEvt.click(screen.getByLabelText('Edit'));
    expect(onEdit).toHaveBeenCalledWith(user);
  });
});
