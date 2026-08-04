import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InspectorRatingsTab } from './InspectorRatingsTab';

const mockUseInspectorSurveys = vi.fn();

vi.mock('../hooks/useInspectorSurveys', () => ({
  useInspectorSurveys: (...args: unknown[]) => mockUseInspectorSurveys(...args),
}));

function renderTab(props: Partial<React.ComponentProps<typeof InspectorRatingsTab>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InspectorRatingsTab inspectorId="insp-1" ratingAvg={4.8} ratingCount={12} {...props} />
    </QueryClientProvider>,
  );
}

const SURVEY = {
  rating: 5,
  comment: 'Very professional, on time.',
  submittedAt: '2026-08-03T10:00:00.000Z',
  appointmentCode: 'INS-0042',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseInspectorSurveys.mockReturnValue({
    surveys: [SURVEY],
    total: 1,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe('InspectorRatingsTab', () => {
  it('lists a response with its rating, code, date and comment', () => {
    renderTab();

    expect(screen.getByText('INS-0042')).toBeInTheDocument();
    expect(screen.getByText('Very professional, on time.')).toBeInTheDocument();
    expect(screen.getByText('Based on 12 responses')).toBeInTheDocument();
  });

  it('never renders a raw identifier', () => {
    // "No raw IDs in the UI" — the inspection is named by its human code, and
    // the respondent is not named at all.
    const { container } = renderTab();

    expect(container.textContent).not.toContain('insp-1');
    expect(container.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('shows a skeleton while loading', () => {
    mockUseInspectorSurveys.mockReturnValue({
      surveys: [], total: 0, isLoading: true, isError: false, error: null, refetch: vi.fn(),
    });

    renderTab();

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an empty state when the inspector has no feedback', () => {
    mockUseInspectorSurveys.mockReturnValue({
      surveys: [], total: 0, isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });

    renderTab({ ratingAvg: null, ratingCount: 0 });

    expect(screen.getByText('No ratings yet')).toBeInTheDocument();
  });

  it('shows a permission state when the API refuses the read', () => {
    // An agency user looking at an inspector whose responses are not theirs.
    mockUseInspectorSurveys.mockReturnValue({
      surveys: [], total: 0, isLoading: false, isError: true,
      error: { status: 403, message: 'Forbidden' }, refetch: vi.fn(),
    });

    renderTab();

    expect(screen.getByText(/cannot view individual responses/i)).toBeInTheDocument();
  });

  it('shows a retryable error for any other failure', () => {
    mockUseInspectorSurveys.mockReturnValue({
      surveys: [], total: 0, isLoading: false, isError: true,
      error: { status: 500, message: 'Server exploded' }, refetch: vi.fn(),
    });

    renderTab();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry|try again/i })).toBeInTheDocument();
  });

  it('offers "Load more" only while responses remain', () => {
    mockUseInspectorSurveys.mockReturnValue({
      surveys: [SURVEY], total: 5, isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });

    renderTab();

    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });

  it('hides "Load more" once everything is shown', () => {
    renderTab();

    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });
});
