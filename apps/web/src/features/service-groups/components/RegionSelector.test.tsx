import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RegionSelector } from './RegionSelector';

vi.mock('../hooks/useResolveRegions', () => ({
  useResolveRegions: vi.fn(),
}));

import { useResolveRegions } from '../hooks/useResolveRegions';
const mockUseResolveRegions = vi.mocked(useResolveRegions);

function renderSelector(props: Partial<React.ComponentProps<typeof RegionSelector>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RegionSelector
          appointmentIds={['apt-1']}
          selectedRegionId=""
          onRegionChange={vi.fn()}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RegionSelector — single banner per state', () => {
  it('shows ONLY the error banner when isError=true', () => {
    mockUseResolveRegions.mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch: vi.fn(), error: null,
    } as any);
    renderSelector();
    expect(screen.getByText(/Failed to load regions/i)).toBeInTheDocument();
    expect(screen.queryByText(/No active regions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be matched/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No inspectors/i)).not.toBeInTheDocument();
  });

  it('shows ONLY the no-match banner when 0 regions and no error', () => {
    mockUseResolveRegions.mockReturnValue({
      data: { regions: [], totalAppointments: 1, unmatchedAppointmentIds: ['apt-1'] },
      isLoading: false, isError: false, refetch: vi.fn(), error: null,
    } as any);
    renderSelector();
    expect(screen.getByText(/No active regions/i)).toBeInTheDocument();
    const manageLink = screen.getByRole('link', { name: /manage regions/i });
    expect(manageLink).toHaveAttribute('href', '/service-regions');
    expect(manageLink).not.toHaveAttribute('target');
    expect(screen.queryByText(/Failed to load/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be matched/i)).not.toBeInTheDocument();
  });

  it('shows ONLY the partial-match banner when some matched and region selected', () => {
    mockUseResolveRegions.mockReturnValue({
      data: {
        regions: [{ regionId: 'r1', regionName: 'North', color: '#000', matchedAppointmentCount: 1, inspectorCount: 2 }],
        totalAppointments: 2,
        unmatchedAppointmentIds: ['apt-2'],
      },
      isLoading: false, isError: false, refetch: vi.fn(), error: null,
    } as any);
    renderSelector({ selectedRegionId: 'r1' });
    expect(screen.getByText(/could not be matched/i)).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No active regions/i)).not.toBeInTheDocument();
  });

  it('never shows two banners simultaneously', () => {
    mockUseResolveRegions.mockReturnValue({
      data: { regions: [], totalAppointments: 1, unmatchedAppointmentIds: ['apt-1'] },
      isLoading: false, isError: true, refetch: vi.fn(), error: null,
    } as any);
    renderSelector();
    // isError takes priority — only one banner visible
    expect(screen.getByText(/Failed to load regions/i)).toBeInTheDocument();
    expect(screen.queryByText(/No active regions/i)).not.toBeInTheDocument();
  });
});
