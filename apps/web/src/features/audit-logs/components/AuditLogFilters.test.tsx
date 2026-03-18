import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditLogFilters } from './AuditLogFilters';
import { DEFAULT_FILTERS } from '../types';

describe('AuditLogFilters', () => {
  it('renders search input', () => {
    render(<AuditLogFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('renders entity type select', () => {
    render(<AuditLogFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Entity Type')).toBeInTheDocument();
  });

  it('renders action select', () => {
    render(<AuditLogFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Action')).toBeInTheDocument();
  });

  it('renders date range filters', () => {
    render(<AuditLogFilters filters={DEFAULT_FILTERS} onFiltersChange={vi.fn()} />);
    expect(screen.getByLabelText('Date - start')).toBeInTheDocument();
    expect(screen.getByLabelText('Date - end')).toBeInTheDocument();
  });
});
