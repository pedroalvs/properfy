import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RestrictionsSection } from '../RestrictionsSection';

describe('RestrictionsSection', () => {
  it('renders nothing when there are no restrictions and no summary', () => {
    const { container } = render(<RestrictionsSection restrictions={[]} summary={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders structured restrictions with home flag, days, hours and notes', () => {
    render(
      <RestrictionsSection
        restrictions={[
          {
            isHome: true,
            unavailableDays: ['Monday', 'Tuesday'],
            unavailableHours: ['08:00-09:00'],
            notes: 'Dog in backyard',
          },
        ]}
        summary="Dog in backyard"
      />,
    );

    expect(screen.getByTestId('restrictions-section')).toBeInTheDocument();
    expect(screen.getByText('Tenant will be home')).toBeInTheDocument();
    expect(screen.getByText(/Monday, Tuesday/)).toBeInTheDocument();
    expect(screen.getByText(/08:00-09:00/)).toBeInTheDocument();
    expect(screen.getByText('Dog in backyard')).toBeInTheDocument();
  });

  it('falls back to the summary string when structured data is empty', () => {
    render(<RestrictionsSection restrictions={[]} summary="No pets during visit" />);
    expect(screen.getByText('No pets during visit')).toBeInTheDocument();
  });

  it('omits empty days/hours rows', () => {
    render(
      <RestrictionsSection
        restrictions={[{ isHome: false, unavailableDays: [], unavailableHours: [], notes: null }]}
        summary={null}
      />,
    );
    expect(screen.queryByText(/Unavailable days/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unavailable hours/)).not.toBeInTheDocument();
    expect(screen.queryByText('Tenant will be home')).not.toBeInTheDocument();
  });
});
