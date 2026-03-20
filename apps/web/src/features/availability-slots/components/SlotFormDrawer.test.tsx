import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

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

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: () => ({ options: [], isLoading: false }),
}));

import { SlotFormDrawer } from './SlotFormDrawer';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SlotFormDrawer', () => {
  it('renders "Create Slot" title for new slot', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <SlotFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    const matches = screen.getAllByText('Create Slot');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Edit Slot" title for existing slot', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <SlotFormDrawer
          open
          onClose={vi.fn()}
          onSaved={vi.fn()}
          slotId="slot-01"
          initialData={{
            id: 'slot-01',
            inspectorId: 'insp-01',
            inspectorName: 'Diego',
            date: '2026-03-20',
            startTime: '08:00',
            endTime: '12:00',
            region: 'North Zone',
            capacity: 3,
            bookedCount: 1,
            status: 'AVAILABLE',
            createdAt: '2026-03-17T10:00:00Z',
          }}
        />
      </Wrapper>,
    );
    expect(screen.getByText('Edit Slot')).toBeInTheDocument();
  });

  it('renders form fields', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <SlotFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Inspector')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Start Time')).toBeInTheDocument();
    expect(screen.getByLabelText('End Time')).toBeInTheDocument();
    expect(screen.getByLabelText('Region')).toBeInTheDocument();
    expect(screen.getByLabelText('Capacity')).toBeInTheDocument();
  });

  it('renders Create Slot submit button in create mode', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <SlotFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    const matches = screen.getAllByText('Create Slot');
    expect(matches.length).toBeGreaterThanOrEqual(2); // title + button
  });

  it('renders Cancel button', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <SlotFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <SlotFormDrawer open={false} onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrapper>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('translate-x-full');
  });
});
