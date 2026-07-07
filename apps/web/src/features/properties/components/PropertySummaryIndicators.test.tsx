import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PropertySummaryIndicators } from './PropertySummaryIndicators';

const SUMMARY = { totalCount: 12, houseCount: 4, apartmentCount: 6 };

function renderIndicators(props: Partial<Parameters<typeof PropertySummaryIndicators>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PropertySummaryIndicators summary={SUMMARY} isLoading={false} isError={false} {...props} />
    </MemoryRouter>,
  );
}

describe('PropertySummaryIndicators', () => {
  it('renders the three counts with their labels', () => {
    renderIndicators();

    expect(screen.getByText('Total Properties')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Houses')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Apartments')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('renders cards as display-only (no links)', () => {
    renderIndicators();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a skeleton while loading', () => {
    renderIndicators({ summary: null, isLoading: true });

    expect(screen.getByTestId('property-summary-loading')).toBeInTheDocument();
    expect(screen.queryByText('Total Properties')).not.toBeInTheDocument();
  });

  it('renders nothing on error so the list is not blocked', () => {
    const { container } = renderIndicators({ summary: null, isError: true });

    expect(container).toBeEmptyDOMElement();
  });
});
