import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemplateFilters } from './TemplateFilters';
import { DEFAULT_TEMPLATE_FILTERS } from '../types';

describe('TemplateFilters', () => {
  it('renders the search input', () => {
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

  it('renders include defaults filter', () => {
    render(
      <TemplateFilters
        filters={DEFAULT_TEMPLATE_FILTERS}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Include Platform Defaults')).toBeInTheDocument();
  });

  it('displays the current search value', () => {
    render(
      <TemplateFilters
        filters={{ search: 'Inspection Notice', channel: '', includeDefaults: 'true', tenantId: '' }}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Inspection Notice')).toBeInTheDocument();
  });

  it('renders the Agency filter when showTenantFilter is true', () => {
    render(
      <TemplateFilters
        filters={DEFAULT_TEMPLATE_FILTERS}
        onFiltersChange={vi.fn()}
        showTenantFilter
        tenantOptions={[{ label: 'Acme Realty', value: 'tenant-1' }]}
      />,
    );
    expect(screen.getByLabelText('Agency')).toBeInTheDocument();
  });

  it('hides the Agency filter by default (non cross-tenant roles)', () => {
    render(
      <TemplateFilters
        filters={DEFAULT_TEMPLATE_FILTERS}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
  });
});
