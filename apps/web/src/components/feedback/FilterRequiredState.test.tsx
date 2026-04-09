import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterRequiredState } from './FilterRequiredState';

describe('FilterRequiredState', () => {
  it('renders default message', () => {
    render(<FilterRequiredState />);
    expect(screen.getByText('Select filters to view data.')).toBeInTheDocument();
  });

  it('renders custom message', () => {
    render(<FilterRequiredState message="Apply a filter to see results." />);
    expect(screen.getByText('Apply a filter to see results.')).toBeInTheDocument();
  });

  it('renders filter icon', () => {
    const { container } = render(<FilterRequiredState />);
    expect(container.querySelector('.mdi-filter-outline')).toBeTruthy();
  });

  it('has status role', () => {
    render(<FilterRequiredState />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
