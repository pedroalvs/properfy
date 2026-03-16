import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { UserListPage } from './UserListPage';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UserListPage', () => {
  it('renders page title "Usuários"', () => {
    render(<UserListPage />);
    expect(screen.getByText('Usuários')).toBeInTheDocument();
  });

  it('renders "Novo Usuário" CTA button', () => {
    render(<UserListPage />);
    expect(screen.getByText('Novo Usuário')).toBeInTheDocument();
  });

  it('renders filter bar with search, role, and status controls', () => {
    render(<UserListPage />);
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Perfil')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with user data after loading', () => {
    render(<UserListPage />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('Admin Principal')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<UserListPage />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.queryByText('Admin Principal')).not.toBeInTheDocument();
  });
});
