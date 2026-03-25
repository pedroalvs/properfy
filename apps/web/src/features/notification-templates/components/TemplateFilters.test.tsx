import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemplateFilters } from './TemplateFilters';
import { DEFAULT_TEMPLATE_FILTERS } from '../types';

describe('TemplateFilters', () => {
  it('renders template code input', () => {
    render(
      <TemplateFilters
        filters={DEFAULT_TEMPLATE_FILTERS}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Template Code')).toBeInTheDocument();
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

  it('displays current template code value', () => {
    render(
      <TemplateFilters
        filters={{ templateCode: 'INSPECTION_NOTICE', channel: '', includeDefaults: 'true' }}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('INSPECTION_NOTICE')).toBeInTheDocument();
  });
});
