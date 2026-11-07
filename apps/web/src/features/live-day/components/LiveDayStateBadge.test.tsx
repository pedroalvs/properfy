import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveDayStateBadge } from './LiveDayStateBadge';

describe('LiveDayStateBadge', () => {
  it('renders the shared label and icon for each state', () => {
    const { container, rerender } = render(<LiveDayStateBadge state="AT_PROPERTY" />);
    expect(screen.getByText('At a property')).toBeInTheDocument();
    expect(container.querySelector('.mdi-home-account')).toBeInTheDocument();

    rerender(<LiveDayStateBadge state="NOT_STARTED" />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(container.querySelector('.mdi-clock-outline')).toBeInTheDocument();

    rerender(<LiveDayStateBadge state="IN_TRANSIT" />);
    expect(screen.getByText('In transit')).toBeInTheDocument();
    expect(container.querySelector('.mdi-car')).toBeInTheDocument();

    rerender(<LiveDayStateBadge state="DONE_FOR_DAY" />);
    expect(screen.getByText('Done for the day')).toBeInTheDocument();
    expect(container.querySelector('.mdi-check-all')).toBeInTheDocument();
  });
});
