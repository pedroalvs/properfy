import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterBar } from './FilterBar';

describe('FilterBar', () => {
  it('renders children', () => {
    render(
      <FilterBar>
        <input placeholder="Search" />
      </FilterBar>,
    );
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
  });

  it('has search role and accessible label', () => {
    render(<FilterBar>content</FilterBar>);
    expect(screen.getByRole('search', { name: 'Filters' })).toBeInTheDocument();
  });

  it('does not show spinner when loading is false', () => {
    render(<FilterBar>content</FilterBar>);
    expect(screen.queryByTestId('filter-loading-spinner')).not.toBeInTheDocument();
  });

  it('shows spinner when loading is true', () => {
    render(<FilterBar loading>content</FilterBar>);
    expect(screen.getByTestId('filter-loading-spinner')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading filters')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<FilterBar className="custom-class">content</FilterBar>);
    expect(screen.getByRole('search').className).toContain('custom-class');
  });
});
