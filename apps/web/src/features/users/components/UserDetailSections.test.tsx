import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole, UserStatus } from '@properfy/shared';
import { UserDetailSections } from './UserDetailSections';
import type { UserDetail } from '../types';

function makeUser(overrides: Partial<UserDetail> = {}): UserDetail {
  return {
    id: 'usr-01',
    tenantId: null,
    branchId: null,
    branchName: 'Filial Centro',
    role: UserRole.AM,
    name: 'Admin Principal',
    email: 'admin@properfy.com',
    phone: '11999000001',
    status: UserStatus.ACTIVE,
    lastLoginAt: '2026-03-15T08:00:00Z',
    createdAt: '2025-06-01T10:00:00Z',
    updatedAt: '2026-03-15T08:00:00Z',
    permissions: ['users.manage', 'tenants.manage', 'billing.manage'],
    twoFactorEnabled: true,
    ...overrides,
  };
}

describe('UserDetailSections', () => {
  it('renders section titles', () => {
    render(<UserDetailSections user={makeUser()} />);
    expect(screen.getByText('Dados Pessoais')).toBeInTheDocument();
    expect(screen.getAllByText('Perfil').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Atividade')).toBeInTheDocument();
    expect(screen.getByText('Registro')).toBeInTheDocument();
  });

  it('renders name and email', () => {
    render(<UserDetailSections user={makeUser()} />);
    expect(screen.getByText('Admin Principal')).toBeInTheDocument();
    expect(screen.getByText('admin@properfy.com')).toBeInTheDocument();
  });

  it('shows phone when present, em-dash when null', () => {
    const { rerender } = render(<UserDetailSections user={makeUser()} />);
    expect(screen.getByText('11999000001')).toBeInTheDocument();

    rerender(<UserDetailSections user={makeUser({ phone: null })} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows role chip and status chip', () => {
    render(<UserDetailSections user={makeUser()} />);
    expect(screen.getByText('Admin Master')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('shows branch name, em-dash when null', () => {
    const { rerender } = render(<UserDetailSections user={makeUser()} />);
    expect(screen.getByText('Filial Centro')).toBeInTheDocument();

    rerender(<UserDetailSections user={makeUser({ branchName: null })} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows permissions list', () => {
    render(<UserDetailSections user={makeUser()} />);
    expect(screen.getByText('users.manage, tenants.manage, billing.manage')).toBeInTheDocument();
  });

  it('shows lastLoginAt when present, em-dash when null', () => {
    const { rerender } = render(<UserDetailSections user={makeUser()} />);
    expect(screen.getByText('Último Acesso')).toBeInTheDocument();

    rerender(<UserDetailSections user={makeUser({ lastLoginAt: null })} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows BooleanIcon for twoFactorEnabled', () => {
    const { rerender } = render(<UserDetailSections user={makeUser({ twoFactorEnabled: true })} />);
    expect(screen.getByLabelText('Sim')).toBeInTheDocument();

    rerender(<UserDetailSections user={makeUser({ twoFactorEnabled: false })} />);
    expect(screen.getByLabelText('Não')).toBeInTheDocument();
  });
});
