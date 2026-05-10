import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  describe('Clear filters affordance', () => {
    it('does not render the clear-all button when onClearAll is omitted', () => {
      render(<FilterBar hasActiveFilters>content</FilterBar>);
      expect(screen.queryByLabelText('Clear filters')).not.toBeInTheDocument();
    });

    it('does not render the clear-all button when hasActiveFilters is false', () => {
      render(<FilterBar onClearAll={() => {}} hasActiveFilters={false}>content</FilterBar>);
      expect(screen.queryByLabelText('Clear filters')).not.toBeInTheDocument();
    });

    it('renders the clear-all button when both onClearAll and hasActiveFilters are set', () => {
      render(<FilterBar onClearAll={() => {}} hasActiveFilters>content</FilterBar>);
      expect(screen.getByLabelText('Clear filters')).toBeInTheDocument();
    });

    it('invokes onClearAll on click', async () => {
      const user = userEvent.setup();
      const onClearAll = vi.fn();
      render(<FilterBar onClearAll={onClearAll} hasActiveFilters>content</FilterBar>);

      await user.click(screen.getByLabelText('Clear filters'));
      expect(onClearAll).toHaveBeenCalledOnce();
    });

    it('honours a custom clearAllLabel', () => {
      render(
        <FilterBar onClearAll={() => {}} hasActiveFilters clearAllLabel="Reset filters">
          content
        </FilterBar>,
      );
      expect(screen.getByLabelText('Reset filters')).toBeInTheDocument();
      expect(screen.queryByLabelText('Clear filters')).not.toBeInTheDocument();
    });
  });
});
