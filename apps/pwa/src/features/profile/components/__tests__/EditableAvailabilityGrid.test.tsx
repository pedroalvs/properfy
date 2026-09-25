import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { EditableAvailabilityGrid } from '../EditableAvailabilityGrid';
import type { InspectorAvailabilityResponse } from '@properfy/shared';

const mockMutateAsync = vi.fn();
const mockMutate = vi.fn();

vi.mock('../../hooks/useUpdateInspectorAvailabilityTemplate', () => ({
  useUpdateInspectorAvailabilityTemplate: () => ({
    mutateAsync: mockMutateAsync,
    mutate: mockMutate,
    isPending: false,
    isError: false,
  }),
}));

const OFF = { am: false, pm: false };
const ON = { am: true, pm: true };

const AVAILABILITY: InspectorAvailabilityResponse = {
  template: { mon: ON, tue: OFF, wed: ON, thu: OFF, fri: ON, sat: OFF, sun: OFF },
  overrides: { mon: OFF, tue: OFF, wed: OFF, thu: OFF, fri: OFF, sat: OFF, sun: OFF },
};

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider, { client },
      React.createElement(MemoryRouter, {}, children),
    );
  };
}

describe('EditableAvailabilityGrid', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the 7×2 availability grid', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper><EditableAvailabilityGrid availability={AVAILABILITY} /></Wrapper>,
    );
    // Should have 14 cells (7 days × 2 slots)
    const cells = screen.getAllByRole('button', { name: /AM|PM/i });
    expect(cells.length).toBe(14);
  });

  it('shows a Save button', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper><EditableAvailabilityGrid availability={AVAILABILITY} /></Wrapper>,
    );
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('toggling a cell flips its aria-pressed/data-state (fails if onToggle is a no-op)', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper><EditableAvailabilityGrid availability={AVAILABILITY} /></Wrapper>,
    );
    // Tuesday AM is OFF initially, clicking should toggle it
    const tuesdayAmBtn = screen.getAllByRole('button', { name: /AM/i })[1]!; // index 1 = Tue
    expect(tuesdayAmBtn).toHaveAttribute('aria-pressed', 'false');
    expect(tuesdayAmBtn).toHaveAttribute('data-state', 'off');

    fireEvent.click(tuesdayAmBtn);

    expect(tuesdayAmBtn).toHaveAttribute('aria-pressed', 'true');
    expect(tuesdayAmBtn).toHaveAttribute('data-state', 'on');
  });

  it('resyncs localTemplate when the availability.template prop changes underneath it', () => {
    const Wrapper = makeWrapper();
    const { rerender } = render(
      <Wrapper><EditableAvailabilityGrid availability={AVAILABILITY} /></Wrapper>,
    );

    // Wednesday AM starts ON.
    const wedAmBtn = screen.getAllByRole('button', { name: /AM/i })[2]!;
    expect(wedAmBtn).toHaveAttribute('aria-pressed', 'true');

    const updated: InspectorAvailabilityResponse = {
      ...AVAILABILITY,
      template: { ...AVAILABILITY.template, wed: OFF },
    };
    rerender(
      <Wrapper><EditableAvailabilityGrid availability={updated} /></Wrapper>,
    );

    const wedAmBtnAfter = screen.getAllByRole('button', { name: /AM/i })[2]!;
    expect(wedAmBtnAfter).toHaveAttribute('aria-pressed', 'false');
  });

  it('Save button calls the mutation with the current template', async () => {
    mockMutateAsync.mockResolvedValue({});
    const Wrapper = makeWrapper();
    render(
      <Wrapper><EditableAvailabilityGrid availability={AVAILABILITY} /></Wrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith(AVAILABILITY.template));
  });

  it('shows error message on mutation failure', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Network error'));
    const Wrapper = makeWrapper();
    render(
      <Wrapper><EditableAvailabilityGrid availability={AVAILABILITY} /></Wrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
