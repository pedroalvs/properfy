import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { InspectorIssue } from '@properfy/shared';
import { InspectorIssueCard } from './InspectorIssueCard';

const baseIssue: InspectorIssue = {
  reason: 'KEY_FAILED',
  note: 'Lockbox code wrong',
  inspectorId: 'insp-1',
  inspectorName: 'Jane Doe',
  occurredAt: '2026-11-03T09:41:00+11:00',
};

describe('InspectorIssueCard', () => {
  it('renders nothing when there is no issue', () => {
    const { container } = render(<InspectorIssueCard issue={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the title, reason, note and reporter for a full issue', () => {
    render(<InspectorIssueCard issue={baseIssue} />);
    expect(screen.getByText("Inspector couldn't complete")).toBeInTheDocument();
    expect(screen.getByText(/Reason:/)).toHaveTextContent("Reason: Key didn't work");
    expect(screen.getByText(/Note:/)).toHaveTextContent('Note: Lockbox code wrong');
    expect(screen.getByText(/Reported by Jane Doe on/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('omits the Note line when there is no note', () => {
    render(<InspectorIssueCard issue={{ ...baseIssue, note: null }} />);
    expect(screen.queryByText(/Note:/)).not.toBeInTheDocument();
  });

  it('falls back to "Inspector" when the inspector name is null', () => {
    render(<InspectorIssueCard issue={{ ...baseIssue, inspectorName: null }} />);
    expect(screen.getByText(/Reported by Inspector on/)).toBeInTheDocument();
  });

  it('humanizes an unknown reason code via the generic humanizer', () => {
    render(<InspectorIssueCard issue={{ ...baseIssue, reason: 'NEW_REASON' }} />);
    expect(screen.getByText(/Reason:/)).toHaveTextContent('Reason: New Reason');
  });

  it('marks "(current inspector)" when the issue inspector is the current one', () => {
    render(<InspectorIssueCard issue={baseIssue} currentInspectorId="insp-1" />);
    expect(screen.getByText(/Reported by Jane Doe \(current inspector\) on/)).toBeInTheDocument();
  });

  it.each([
    ['a different inspector', 'insp-2'],
    ['no current inspector', null],
    ['an undefined current inspector', undefined],
  ])('does not add the suffix for %s', (_label, currentInspectorId) => {
    render(<InspectorIssueCard issue={baseIssue} currentInspectorId={currentInspectorId ?? undefined} />);
    expect(screen.queryByText(/\(current inspector\)/)).not.toBeInTheDocument();
  });

  it('does not add the suffix when the issue has no inspectorId even if a current id is given', () => {
    render(
      <InspectorIssueCard
        issue={{ ...baseIssue, inspectorId: null }}
        currentInspectorId="insp-1"
      />,
    );
    expect(screen.queryByText(/\(current inspector\)/)).not.toBeInTheDocument();
  });

  it('forwards a data-testid for the map variant', () => {
    render(<InspectorIssueCard issue={baseIssue} variant="compact" data-testid="map-detail-inspector-issue" />);
    expect(screen.getByTestId('map-detail-inspector-issue')).toBeInTheDocument();
  });
});
