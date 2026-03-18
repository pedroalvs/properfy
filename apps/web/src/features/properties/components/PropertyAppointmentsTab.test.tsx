import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { api } from '@/services/api';
import { PropertyAppointmentsTab } from './PropertyAppointmentsTab';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_APPOINTMENTS = [
  { id: 'apt-01', code: 'VST-001', status: 'SCHEDULED', serviceTypeName: 'Routine', scheduledDate: '2026-04-01', timeSlot: '09:00-12:00', inspectorName: 'Diego', createdAt: '2026-03-01T10:00:00Z' },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_APPOINTMENTS,
    pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
  } });
});

describe('PropertyAppointmentsTab', () => {
  it('renders appointment data', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PropertyAppointmentsTab propertyId="prop-01" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('VST-001')).toBeInTheDocument();
    });
  });

  it('renders column headers', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PropertyAppointmentsTab propertyId="prop-01" />
      </Wrapper>,
    );
    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Service Type')).toBeInTheDocument();
  });
});
