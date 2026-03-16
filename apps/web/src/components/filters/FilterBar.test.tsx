import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterBar } from './FilterBar';

describe('FilterBar', () => {
  it('renders children in a grid', () => {
    render(
      <FilterBar>
        <div>Filter 1</div>
        <div>Filter 2</div>
      </FilterBar>,
    );
    expect(screen.getByText('Filter 1')).toBeInTheDocument();
    expect(screen.getByText('Filter 2')).toBeInTheDocument();
  });

  it('has search role for accessibility', () => {
    render(
      <FilterBar>
        <div>Filter</div>
      </FilterBar>,
    );
    expect(screen.getByRole('search')).toBeInTheDocument();
  });
});
