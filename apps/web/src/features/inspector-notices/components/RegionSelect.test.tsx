import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

import { api } from '@/services/api';
import { RegionSelect } from './RegionSelect';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

function opts(): RenderOptions {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
}

function Host({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <RegionSelect value={value} onChange={setValue} />;
}

const REGIONS = {
  data: {
    data: [
      { id: 'r1', name: 'North Shore', inspectorCount: 8 },
      { id: 'r2', name: 'Inner West', inspectorCount: 0 },
    ],
    pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
  },
};

beforeEach(() => {
  mockGet.mockReset();
});

describe('RegionSelect', () => {
  it('renders options with their inspector counts', async () => {
    mockGet.mockResolvedValue(REGIONS);
    render(<Host />, opts());
    // Open the select to reveal options.
    const trigger = await screen.findByText('Choose a region');
    fireEvent.click(trigger);
    expect(await screen.findByText('North Shore (8 inspectors)')).toBeInTheDocument();
    expect(screen.getByText('Inner West (0 inspectors)')).toBeInTheDocument();
  });

  it('warns when the chosen region has no inspectors', async () => {
    mockGet.mockResolvedValue(REGIONS);
    render(<Host initial="r2" />, opts());
    expect(await screen.findByText('This region has no inspectors.')).toBeInTheDocument();
  });

  it('does not warn for a region with inspectors', async () => {
    mockGet.mockResolvedValue(REGIONS);
    render(<Host initial="r1" />, opts());
    // Wait for the region query to resolve (the trigger shows the selected label).
    await screen.findByText(/North Shore/);
    expect(screen.queryByText('This region has no inspectors.')).not.toBeInTheDocument();
  });

  it('shows a load error with Retry', async () => {
    mockGet.mockResolvedValue({ error: { error: { code: 'BOOM', message: 'x' } }, response: { status: 500 } });
    render(<Host />, opts());
    expect(await screen.findByText("Couldn't load regions.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
