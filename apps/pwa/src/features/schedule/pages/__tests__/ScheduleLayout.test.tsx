import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { ScheduleLayout } from '../ScheduleLayout';

// The master list has its own data hooks; stub it so the test focuses on the two-pane wiring.
vi.mock('../SchedulePage', () => ({
  SchedulePage: () => <div data-testid="schedule-master">list</div>,
}));

function renderAt(path: string) {
  const routes: RouteObject[] = [
    {
      path: 'schedule',
      element: <ScheduleLayout />,
      children: [
        { index: true, element: null },
        { path: ':appointmentId', element: <div data-testid="appointment-detail">detail</div> },
      ],
    },
  ];
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
    future: { v7_relativeSplatPath: true },
  });
  return render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
}

describe('ScheduleLayout', () => {
  it('shows the list master and the empty-state pane at /schedule (no selection)', () => {
    renderAt('/schedule');
    expect(screen.getByTestId('schedule-master')).toBeInTheDocument();
    expect(screen.getByText('Select an appointment')).toBeInTheDocument();
    expect(screen.queryByTestId('appointment-detail')).not.toBeInTheDocument();
    // Phone: master visible, empty pane is tablet-only.
    expect(screen.getByTestId('two-pane-master').className).not.toContain('hidden');
  });

  it('keeps the master mounted and renders the detail pane at /schedule/:id', () => {
    renderAt('/schedule/appt-1');
    // Master stays mounted (the point of the split view — no remount on selection).
    expect(screen.getByTestId('schedule-master')).toBeInTheDocument();
    expect(screen.getByTestId('appointment-detail')).toBeInTheDocument();
    expect(screen.queryByText('Select an appointment')).not.toBeInTheDocument();
    // Phone: the master collapses so the detail fills; tablet keeps both via md:block.
    expect(screen.getByTestId('two-pane-master').className).toContain('hidden md:block');
  });
});
