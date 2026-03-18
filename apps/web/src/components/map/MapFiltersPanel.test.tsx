import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapFiltersPanel } from './MapFiltersPanel';

describe('MapFiltersPanel', () => {
  it('renders with default title', () => {
    render(
      <MapFiltersPanel>
        <div>Filter content</div>
      </MapFiltersPanel>,
    );
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('renders with custom title', () => {
    render(
      <MapFiltersPanel title="Map Filters">
        <div>Content</div>
      </MapFiltersPanel>,
    );
    expect(screen.getByText('Map Filters')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <MapFiltersPanel>
        <div>Filter controls here</div>
      </MapFiltersPanel>,
    );
    expect(screen.getByText('Filter controls here')).toBeInTheDocument();
  });

  it('toggles content visibility on click', () => {
    render(
      <MapFiltersPanel>
        <div>Content</div>
      </MapFiltersPanel>,
    );
    const button = screen.getByRole('button', { name: /filters/i });
    expect(button).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('starts collapsed when defaultCollapsed is true', () => {
    render(
      <MapFiltersPanel defaultCollapsed>
        <div>Content</div>
      </MapFiltersPanel>,
    );
    const button = screen.getByRole('button', { name: /filters/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
