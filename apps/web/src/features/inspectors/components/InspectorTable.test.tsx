import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InspectorStatus } from '@properfy/shared';
import { InspectorTable } from './InspectorTable';
import type { Inspector } from '../types';

function makeInspector(overrides: Partial<Inspector> = {}): Inspector {
  return {
    id: 'insp-1',
    name: 'Carlos Inspetor',
    email: 'carlos@inspecoes.com',
    phone: '11999999999',
    status: InspectorStatus.ACTIVE,
    regionsCount: 3,
    serviceTypesCount: 5,
    ratingAvg: 4.8,
    ratingCount: 12,
    completedCount: 245,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z',
    ...overrides,
  };
}

describe('InspectorTable', () => {
  it('renders column headers', () => {
    render(<InspectorTable data={[]} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Regions')).toBeInTheDocument();
    // Renamed from "Services" — it counts service TYPES, and a second "Services"
    // column next to the completed-inspections count would be ambiguous.
    expect(screen.getByText('Service Types')).toBeInTheDocument();
    expect(screen.queryByText('Services')).not.toBeInTheDocument();
    expect(screen.getByText('Rating')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  describe('rating column', () => {
    it('shows the average, the response count and the completed total', () => {
      render(<InspectorTable data={[makeInspector()]} />);

      expect(screen.getByText('4.80')).toBeInTheDocument();
      expect(screen.getByText('(12)')).toBeInTheDocument();
      expect(screen.getByText('245')).toBeInTheDocument();
    });

    it('shows a dash rather than a zero score for an unrated inspector', () => {
      render(<InspectorTable data={[makeInspector({ ratingAvg: null, ratingCount: 0 })]} />);

      expect(screen.queryByText('0.00')).not.toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('keeps unrated inspectors last in both sort directions', async () => {
      // compareValues sends nullish last regardless of direction, which is what
      // stops an unrated inspector from topping an ascending sort. This only
      // holds because ratingAvg is null, never 0.
      const user = userEvent.setup();
      render(
        <InspectorTable
          data={[
            makeInspector({ id: 'a', name: 'Unrated', ratingAvg: null, ratingCount: 0 }),
            makeInspector({ id: 'b', name: 'Rated', ratingAvg: 3.2, ratingCount: 4 }),
          ]}
        />,
      );

      const header = screen.getByText('Rating');
      const namesInOrder = () =>
        screen.getAllByText(/^(Unrated|Rated)$/).map((el) => el.textContent);

      await user.click(header);
      expect(namesInOrder()[1]).toBe('Unrated');

      await user.click(header);
      expect(namesInOrder()[1]).toBe('Unrated');
    });
  });

  it('renders inspector data (name, email, regions/services counts)', () => {
    const insp = makeInspector();
    render(<InspectorTable data={[insp]} />);
    expect(screen.getByText('Carlos Inspetor')).toBeInTheDocument();
    expect(screen.getByText('carlos@inspecoes.com')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders InspectorStatusChip', () => {
    const insp = makeInspector({ status: InspectorStatus.INACTIVE });
    render(<InspectorTable data={[insp]} />);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('renders em dash for null phone', () => {
    const insp = makeInspector({ phone: null });
    render(<InspectorTable data={[insp]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<InspectorTable data={[]} loading />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<InspectorTable data={[]} />);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<InspectorTable data={[]} error="Network error" />);
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('view action calls onView with correct inspector', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const insp = makeInspector();
    render(<InspectorTable data={[insp]} onView={onView} />);
    await user.click(screen.getByLabelText('View'));
    expect(onView).toHaveBeenCalledWith(insp);
  });

  it('does not render pencil edit action (014 FR-019b)', () => {
    const insp = makeInspector();
    render(<InspectorTable data={[insp]} />);
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
  });
});
