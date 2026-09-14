import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  // #591: interaction coverage — every control must call onFiltersChange with the
  // updated filters. Rendering-only assertions never caught a broken handler.
  it('fires onFiltersChange with the typed search term', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(<TemplateFilters filters={DEFAULT_TEMPLATE_FILTERS} onFiltersChange={onFiltersChange} />);

    await user.type(screen.getByLabelText('Search'), 'notice');

    // FilterInput is debounced; wait for the flushed change carrying the value.
    await waitFor(() =>
      expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ search: 'notice' })),
    );
  });

  it('fires onFiltersChange when the Channel is selected', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(<TemplateFilters filters={DEFAULT_TEMPLATE_FILTERS} onFiltersChange={onFiltersChange} />);

    await user.click(screen.getByRole('button', { name: 'Channel' }));
    await user.click(screen.getByRole('option', { name: 'Email' }));

    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ channel: 'EMAIL' }));
  });

  it('fires onFiltersChange when Include Platform Defaults is toggled', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(<TemplateFilters filters={DEFAULT_TEMPLATE_FILTERS} onFiltersChange={onFiltersChange} />);

    await user.click(screen.getByRole('button', { name: 'Include Platform Defaults' }));
    await user.click(screen.getByRole('option', { name: 'No' }));

    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ includeDefaults: 'false' }));
  });

  it('fires onFiltersChange when an Agency is selected (showTenantFilter)', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <TemplateFilters
        filters={DEFAULT_TEMPLATE_FILTERS}
        onFiltersChange={onFiltersChange}
        showTenantFilter
        tenantOptions={[{ label: 'Acme Realty', value: 'tenant-1' }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Agency' }));
    await user.click(screen.getByRole('option', { name: 'Acme Realty' }));

    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1' }));
  });
});
