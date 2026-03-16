import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { InspectorListPage } from './InspectorListPage';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('InspectorListPage', () => {
  it('renders page title "Inspetores"', () => {
    render(<InspectorListPage />);
    expect(screen.getByText('Inspetores')).toBeInTheDocument();
  });

  it('renders "Novo Inspetor" CTA button', () => {
    render(<InspectorListPage />);
    expect(screen.getByText('Novo Inspetor')).toBeInTheDocument();
  });

  it('renders filter bar with search and status controls', () => {
    render(<InspectorListPage />);
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with inspector data after loading', () => {
    render(<InspectorListPage />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<InspectorListPage />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.queryByText('Carlos Silva')).not.toBeInTheDocument();
  });
});
