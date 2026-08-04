import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurveySubmittedCard } from './SurveySubmittedCard';

describe('SurveySubmittedCard', () => {
  it('shows the rating and when it was given', () => {
    render(<SurveySubmittedCard rating={5} comment="Great job" submittedAt="2026-08-03T10:00:00.000Z" />);

    expect(screen.getByText(/thanks for your feedback/i)).toBeInTheDocument();
    expect(screen.getByText('5.00')).toBeInTheDocument();
    expect(screen.getByText(/great job/i)).toBeInTheDocument();
    expect(screen.getByText(/submitted/i)).toBeInTheDocument();
  });

  it('omits the quote block when no comment was left', () => {
    render(<SurveySubmittedCard rating={4} comment={null} submittedAt="2026-08-03T10:00:00.000Z" />);

    expect(screen.queryByRole('blockquote')).not.toBeInTheDocument();
    expect(screen.getByText('4.00')).toBeInTheDocument();
  });

  it('offers no way to change the answer', () => {
    // One immutable submission: an edit affordance here would promise something
    // the API refuses.
    render(<SurveySubmittedCard rating={3} submittedAt="2026-08-03T10:00:00.000Z" />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});
