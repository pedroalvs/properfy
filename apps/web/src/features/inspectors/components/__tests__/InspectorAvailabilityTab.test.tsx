import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
    }
  },
}));
vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: () => ({ options: [], isLoading: false }),
}));

const { mockUseAvailability, mockSlotFormDrawer } = vi.hoisted(() => ({
  mockUseAvailability: vi.fn(),
  mockSlotFormDrawer: vi.fn(),
}));

vi.mock('../../hooks/useInspectorAvailabilityTemplateById', () => ({
  useInspectorAvailabilityTemplateById: (id: string) => mockUseAvailability(id),
}));

vi.mock('@/features/availability-slots/components/SlotFormDrawer', () => ({
  SlotFormDrawer: (props: Record<string, unknown>) => {
    mockSlotFormDrawer(props);
    return props['open'] ? <div data-testid="slot-form-drawer" /> : null;
  },
}));

import { InspectorAvailabilityTab } from '../InspectorAvailabilityTab';

const OFF = { am: false, pm: false };
const ON = { am: true, pm: true };

const MOCK_AVAILABILITY = {
  template: { mon: ON, tue: OFF, wed: ON, thu: OFF, fri: ON, sat: OFF, sun: OFF },
  overrides: { mon: OFF, tue: OFF, wed: OFF, thu: OFF, fri: OFF, sat: OFF, sun: OFF },
};

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('InspectorAvailabilityTab', () => {
  beforeEach(() => {
    // Default: data loaded state
    mockUseAvailability.mockReturnValue({ data: MOCK_AVAILABILITY, isLoading: false, isError: false });
    mockSlotFormDrawer.mockReturnValue(null);
  });

  it('shows loading state while query is pending', () => {
    mockUseAvailability.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const Wrapper = makeWrapper();
    render(
      <Wrapper><InspectorAvailabilityTab inspectorId="insp-01" /></Wrapper>,
    );
    expect(screen.getByTestId('availability-tab-loading')).toBeInTheDocument();
  });

  it('renders 7×2 grid when data is loaded', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper><InspectorAvailabilityTab inspectorId="insp-01" /></Wrapper>,
    );
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((day) => {
      expect(screen.getByText(day)).toBeInTheDocument();
    });
  });

  it('renders an Override button per day', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper><InspectorAvailabilityTab inspectorId="insp-01" /></Wrapper>,
    );
    const overrideButtons = screen.getAllByRole('button', { name: /override/i });
    expect(overrideButtons.length).toBe(7);
  });

  it('opens SlotFormDrawer with inspectorId and nextOccurrence date on Override click', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper><InspectorAvailabilityTab inspectorId="insp-01" /></Wrapper>,
    );

    const overrideButtons = screen.getAllByRole('button', { name: /override/i });
    fireEvent.click(overrideButtons[0]!); // Monday

    expect(screen.getByTestId('slot-form-drawer')).toBeInTheDocument();
    const lastCall = mockSlotFormDrawer.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(lastCall?.['defaultValues']).toMatchObject({ inspectorId: 'insp-01' });
    expect(typeof (lastCall?.['defaultValues'] as Record<string, string>)?.['date']).toBe('string');
  });
});
