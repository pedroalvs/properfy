import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemplateFilters } from './TemplateFilters';
import { DEFAULT_TEMPLATE_FILTERS } from '../types';

describe('TemplateFilters', () => {
  it('renders search input', () => {
    render(
      <TemplateFilters
        filters={DEFAULT_TEMPLATE_FILTERS}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('renders channel filter', () => {
    render(
      <TemplateFilters
        filters={DEFAULT_TEMPLATE_FILTERS}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Channel')).toBeInTheDocument();
  });

  it('renders active/status filter', () => {
    render(
      <TemplateFilters
        filters={DEFAULT_TEMPLATE_FILTERS}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('displays current search value', () => {
    render(
      <TemplateFilters
        filters={{ search: 'INSPECTION', channel: '', active: '' }}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('INSPECTION')).toBeInTheDocument();
  });
});
