import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { ScheduleLayout } from '../ScheduleLayout';

// The master list has its own data hooks; stub it so the test focuses on the two-pane wiring.
vi.mock('../SchedulePage', () => ({
  SchedulePage: () => <div data-testid="schedule-master">list</div>,
}));

// Spy on navigation so the close control can be asserted without driving a real router
// navigation (which trips a jsdom/undici AbortSignal quirk under RouterProvider).
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

  it('navigates back to the list when the close control is used', async () => {
    mockNavigate.mockClear();
    const user = userEvent.setup();
    renderAt('/schedule/appt-1');
    expect(screen.getByTestId('appointment-detail')).toBeInTheDocument();
    await user.click(screen.getByTestId('two-pane-close'));
    expect(mockNavigate).toHaveBeenCalledWith('/schedule');
  });
});
