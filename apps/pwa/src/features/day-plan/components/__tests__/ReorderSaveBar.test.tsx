import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { ReorderSaveBar } from '../ReorderSaveBar';
import type { ReorderDraft } from '../../hooks/useReorderDraft';
import type { SaveOrderResult } from '../../hooks/useSaveDayPlanOrder';

let onlineValue = true;
vi.mock('@/hooks/useIsOnline', () => ({ useIsOnline: () => onlineValue }));
vi.mock('@/lib/use-unsaved-changes-prompt', () => ({ useUnsavedChangesPrompt: () => {} }));

const mockSave = vi.fn<[], Promise<SaveOrderResult>>();
let pending = false;
vi.mock('../../hooks/useSaveDayPlanOrder', () => ({
  useSaveDayPlanOrder: () => ({ save: () => mockSave(), isPending: pending }),
}));

function makeDraft(overrides: Partial<ReorderDraft> = {}): ReorderDraft {
  return {
    order: ['a', 'b', 'c'],
    reorderableIds: ['a', 'b', 'c'],
    lockedIds: [],
    displayOrder: ['a', 'b', 'c'],
    canReorder: true,
    isDirty: true,
    frozen: false,
    stale: false,
    baseVersion: 3,
    evaluation: {
      finishS: 0,
      deltaFinishMin: 12,
      totalTravelS: 3300,
      violations: [],
      serviceStartByKey: {},
      invalid: false,
    },
    notice: null,
    moveTo: vi.fn(),
    moveUp: vi.fn(),
    moveDown: vi.fn(),
    resetToSuggested: vi.fn(),
    discard: vi.fn(),
    review: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  onlineValue = true;
  pending = false;
  mockSave.mockReset();
});

describe('ReorderSaveBar', () => {
  it('shows the bar with the delta, Save and Discard when dirty', () => {
    renderWithProviders(<ReorderSaveBar draft={makeDraft()} date="2026-11-05" />);
    expect(screen.getByTestId('reorder-save-bar')).toBeInTheDocument();
    expect(screen.getByText('+12 min vs. suggested')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save order' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('hides the bar when not dirty', () => {
    renderWithProviders(<ReorderSaveBar draft={makeDraft({ isDirty: false })} date="2026-11-05" />);
    expect(screen.queryByTestId('reorder-save-bar')).toBeNull();
  });

  it('clears the draft on a successful save', async () => {
    mockSave.mockResolvedValue({ status: 'SAVED' });
    const draft = makeDraft();
    renderWithProviders(<ReorderSaveBar draft={draft} date="2026-11-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() => expect(draft.clear).toHaveBeenCalled());
  });

  it('on a version conflict clears the draft and alerts to review', async () => {
    mockSave.mockResolvedValue({ status: 'CONFLICT' });
    const draft = makeDraft();
    renderWithProviders(<ReorderSaveBar draft={draft} date="2026-11-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() =>
      expect(screen.getByText('Your route was updated. Review it before saving your order.')).toBeInTheDocument(),
    );
    expect(draft.clear).toHaveBeenCalled();
  });

  it('on a mismatch alerts to review the changed stops', async () => {
    mockSave.mockResolvedValue({ status: 'MISMATCH' });
    renderWithProviders(<ReorderSaveBar draft={makeDraft()} date="2026-11-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() =>
      expect(screen.getByText('Your stops changed. Review the route and try again.')).toBeInTheDocument(),
    );
  });

  it('on already-started clears the draft and explains the route continues from the last stop', async () => {
    mockSave.mockResolvedValue({ status: 'ALREADY_STARTED' });
    const draft = makeDraft();
    renderWithProviders(<ReorderSaveBar draft={draft} date="2026-11-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() =>
      expect(screen.getByText('Your day has started; the route continues from your last stop.')).toBeInTheDocument(),
    );
    expect(draft.clear).toHaveBeenCalled();
  });

  it('keeps the draft on a network error', async () => {
    mockSave.mockResolvedValue({ status: 'NETWORK' });
    const draft = makeDraft();
    renderWithProviders(<ReorderSaveBar draft={draft} date="2026-11-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() =>
      expect(screen.getByText("Couldn't save. Check your connection and try again.")).toBeInTheDocument(),
    );
    expect(draft.clear).not.toHaveBeenCalled();
  });

  it('keeps the draft and warns on a rate limit', async () => {
    mockSave.mockResolvedValue({ status: 'RATE_LIMIT' });
    const draft = makeDraft();
    renderWithProviders(<ReorderSaveBar draft={draft} date="2026-11-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() =>
      expect(screen.getByText('Too many changes in a short time. Try again in a minute.')).toBeInTheDocument(),
    );
    expect(draft.clear).not.toHaveBeenCalled();
  });

  it('disables Save offline with a hint', () => {
    onlineValue = false;
    renderWithProviders(<ReorderSaveBar draft={makeDraft()} date="2026-11-05" />);
    expect(screen.getByRole('button', { name: 'Save order' })).toBeDisabled();
    expect(screen.getByText('Connect to save your order.')).toBeInTheDocument();
  });

  it('when frozen shows Review, blocks Save and shows the updated alert', () => {
    const draft = makeDraft({ frozen: true });
    renderWithProviders(<ReorderSaveBar draft={draft} date="2026-11-05" />);
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save order' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(draft.review).toHaveBeenCalled();
  });

  it('when stale blocks Save with an updating hint', () => {
    renderWithProviders(<ReorderSaveBar draft={makeDraft({ stale: true })} date="2026-11-05" />);
    expect(screen.getByRole('button', { name: 'Save order' })).toBeDisabled();
    expect(screen.getByText('Updating your route…')).toBeInTheDocument();
  });

  it('disables Save while a save is pending (no double submit)', () => {
    pending = true;
    renderWithProviders(<ReorderSaveBar draft={makeDraft()} date="2026-11-05" />);
    const save = screen.getByRole('button', { name: /Saving|Save order/ });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the removed-stop notice even after the draft is discarded', () => {
    renderWithProviders(<ReorderSaveBar draft={makeDraft({ isDirty: false, notice: 'SET_DISCARDED' })} date="2026-11-05" />);
    expect(screen.getByTestId('reorder-set-discarded')).toHaveTextContent(
      'A stop was removed from your route. Your changes were discarded.',
    );
  });
});
