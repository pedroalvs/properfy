import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { ScheduleLayout } from '../ScheduleLayout';

// The master list has its own data hooks; stub it so the test focuses on the two-pane wiring.
vi.mock('../SchedulePage', () => ({
  SchedulePage: () => <div data-testid="schedule-master">list</div>,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useNavigate: () => mockNavigate };
});

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
  it('shows only the list master (collapsed detail) at /schedule', () => {
    renderAt('/schedule');
    expect(screen.getByTestId('schedule-master')).toBeInTheDocument();
    expect(screen.queryByTestId('appointment-detail')).not.toBeInTheDocument();
    // No persistent empty-state pane; the detail is collapsed to zero width.
    expect(screen.getByTestId('two-pane-detail').className).toContain('md:w-0');
    expect(screen.queryByTestId('two-pane-close')).not.toBeInTheDocument();
    expect(screen.getByTestId('two-pane-master').className).not.toContain('hidden');
  });

  it('keeps the master mounted and expands the detail at /schedule/:id', () => {
    renderAt('/schedule/appt-1');
    expect(screen.getByTestId('schedule-master')).toBeInTheDocument();
    expect(screen.getByTestId('appointment-detail')).toBeInTheDocument();
    expect(screen.getByTestId('two-pane-detail').className).toContain('md:w-[58%]');
    // Phone: the master collapses so the detail fills; tablet keeps both via md:block.
    expect(screen.getByTestId('two-pane-master').className).toContain('hidden md:block');
  });

  it('omits the frame close — the detail page TopBar back closes the pane', () => {
    renderAt('/schedule/appt-1');
    // The floating frame close would overlap the detail TopBar's offline indicator, so the layout
    // sets showClose={false} and relies on the sub-page's own back chevron to close.
    expect(screen.queryByTestId('two-pane-close')).not.toBeInTheDocument();
    expect(screen.getByTestId('appointment-detail')).toBeInTheDocument();
  });
});
