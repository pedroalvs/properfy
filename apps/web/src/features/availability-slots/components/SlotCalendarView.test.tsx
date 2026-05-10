import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlotCalendarView } from './SlotCalendarView';
import type { AvailabilitySlot } from '../types';

const MONDAY = new Date('2026-03-16T00:00:00');

const MOCK_SLOTS: AvailabilitySlot[] = [
  {
    id: 'slot-01',
    inspectorId: 'insp-01',
    inspectorName: 'Diego',
    date: '2026-03-16',
    startTime: '08:00',
    endTime: '12:00',
    region: 'North Zone',
    capacity: 3,
    bookedCount: 1,
    status: 'AVAILABLE',
    createdAt: '2026-03-15T10:00:00Z',
  },
  {
    id: 'slot-02',
    inspectorId: 'insp-02',
    inspectorName: 'Carlos',
    date: '2026-03-17',
    startTime: '13:00',
    endTime: '17:00',
    region: 'South Zone',
    capacity: 2,
    bookedCount: 2,
    status: 'BOOKED',
    createdAt: '2026-03-15T11:00:00Z',
  },
];

describe('SlotCalendarView', () => {
  it('renders day headers', () => {
    render(
      <SlotCalendarView
        slots={[]}
        selectedInspectorId=""
        onInspectorChange={vi.fn()}
        weekStart={MONDAY}
        onWeekChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Mon 16/)).toBeInTheDocument();
    expect(screen.getByText(/Tue 17/)).toBeInTheDocument();
    expect(screen.getByText(/Wed 18/)).toBeInTheDocument();
    expect(screen.getByText(/Thu 19/)).toBeInTheDocument();
    expect(screen.getByText(/Fri 20/)).toBeInTheDocument();
    expect(screen.getByText(/Sat 21/)).toBeInTheDocument();
    expect(screen.getByText(/Sun 22/)).toBeInTheDocument();
  });

  it('renders hour rows', () => {
    render(
      <SlotCalendarView
        slots={[]}
        selectedInspectorId=""
        onInspectorChange={vi.fn()}
        weekStart={MONDAY}
        onWeekChange={vi.fn()}
      />,
    );
    expect(screen.getByText('06:00')).toBeInTheDocument();
    expect(screen.getByText('12:00')).toBeInTheDocument();
    expect(screen.getByText('22:00')).toBeInTheDocument();
  });

  it('shows week navigation', () => {
    render(
      <SlotCalendarView
        slots={[]}
        selectedInspectorId=""
        onInspectorChange={vi.fn()}
        weekStart={MONDAY}
        onWeekChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Previous week')).toBeInTheDocument();
    expect(screen.getByLabelText('Next week')).toBeInTheDocument();
    expect(screen.getByTestId('week-label')).toBeInTheDocument();
  });

  it('renders slot blocks', () => {
    render(
      <SlotCalendarView
        slots={MOCK_SLOTS}
        selectedInspectorId=""
        onInspectorChange={vi.fn()}
        weekStart={MONDAY}
        onWeekChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('slot-block-slot-01')).toBeInTheDocument();
    expect(screen.getByTestId('slot-block-slot-02')).toBeInTheDocument();
  });

  it('filters by inspector', () => {
    render(
      <SlotCalendarView
        slots={MOCK_SLOTS}
        selectedInspectorId="insp-01"
        onInspectorChange={vi.fn()}
        weekStart={MONDAY}
        onWeekChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('slot-block-slot-01')).toBeInTheDocument();
    expect(screen.queryByTestId('slot-block-slot-02')).not.toBeInTheDocument();
  });

  it('navigates to previous week', async () => {
    const onWeekChange = vi.fn();
    render(
      <SlotCalendarView
        slots={[]}
        selectedInspectorId=""
        onInspectorChange={vi.fn()}
        weekStart={MONDAY}
        onWeekChange={onWeekChange}
      />,
    );
    await userEvent.click(screen.getByLabelText('Previous week'));
    expect(onWeekChange).toHaveBeenCalledTimes(1);
    const calledDate = onWeekChange.mock.calls[0][0] as Date;
    expect(calledDate.getDate()).toBe(9);
  });

  it('navigates to next week', async () => {
    const onWeekChange = vi.fn();
    render(
      <SlotCalendarView
        slots={[]}
        selectedInspectorId=""
        onInspectorChange={vi.fn()}
        weekStart={MONDAY}
        onWeekChange={onWeekChange}
      />,
    );
    await userEvent.click(screen.getByLabelText('Next week'));
    expect(onWeekChange).toHaveBeenCalledTimes(1);
    const calledDate = onWeekChange.mock.calls[0][0] as Date;
    expect(calledDate.getDate()).toBe(23);
  });

  it('renders inspector filter dropdown', () => {
    render(
      <SlotCalendarView
        slots={MOCK_SLOTS}
        selectedInspectorId=""
        onInspectorChange={vi.fn()}
        weekStart={MONDAY}
        onWeekChange={vi.fn()}
      />,
    );
    // UX-baseline cleanup: the bespoke `<select aria-label="Inspector filter">`
    // was replaced by the shared `<FilterSelect label="Inspector" />`. The
    // trigger now exposes `aria-label="Inspector"`. The placeholder
    // ("All Inspectors") only renders inside the dropdown body when the
    // popover is open, so we only assert on the trigger here.
    expect(screen.getByLabelText('Inspector')).toBeInTheDocument();
  });
});
