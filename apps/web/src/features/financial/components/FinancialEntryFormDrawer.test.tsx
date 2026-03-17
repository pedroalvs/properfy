import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { FinancialEntryFormDrawer } from './FinancialEntryFormDrawer';

function SnackbarDisplay() {
  const { messages } = useSnackbar();
  return (
    <div data-testid="snackbar-display">
      {messages.map((m) => (
        <div key={m.id}>{m.message}</div>
      ))}
    </div>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarProvider>
      {children}
      <SnackbarDisplay />
    </SnackbarProvider>
  );
}

interface RenderOptions {
  open?: boolean;
  entryId?: string | null;
  onClose?: () => void;
  onSaved?: () => void;
}

function renderDrawer(options: RenderOptions = {}) {
  const {
    open = true,
    entryId = null,
    onClose = vi.fn(),
    onSaved = vi.fn(),
  } = options;
  return render(
    <Wrapper>
      <FinancialEntryFormDrawer
        open={open}
        onClose={onClose}
        entryId={entryId}
        onSaved={onSaved}
      />
    </Wrapper>,
  );
}

function fillRequiredFields() {
  fireEvent.click(screen.getByLabelText('Type'));
  fireEvent.click(screen.getByText('Tenant Debit'));
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '350' } });
  fireEvent.change(screen.getByLabelText('Effective Date'), { target: { value: '2026-03-15' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Test debit' } });
  fireEvent.change(screen.getByLabelText('Related Entity'), { target: { value: 'Test Agency' } });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FinancialEntryFormDrawer', () => {
  it('renders "New Entry" title in create mode', () => {
    renderDrawer();
    expect(screen.getByText('New Entry')).toBeInTheDocument();
  });

  it('renders "Edit Entry" title in edit mode', () => {
    renderDrawer({ entryId: 'fin-01' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Edit Entry')).toBeInTheDocument();
  });

  it('renders all form sections in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Type & Values')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    const notesMatches = screen.getAllByText('Notes');
    expect(notesMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders all required field labels', () => {
    renderDrawer();
    const typeMatches = screen.getAllByText('Type');
    expect(typeMatches.length).toBeGreaterThanOrEqual(1);
    const amountMatches = screen.getAllByText('Amount');
    expect(amountMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Effective Date')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Related Entity')).toBeInTheDocument();
  });

  it('renders "Create Entry" submit button in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Create Entry')).toBeInTheDocument();
  });

  it('renders "Save" submit button in edit mode', () => {
    renderDrawer({ entryId: 'fin-01' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('shows validation errors on empty create submit', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('Create Entry'));
    const errorMessages = screen.getAllByText('Required field');
    expect(errorMessages).toHaveLength(5);
  });

  it('clears validation error when field is corrected', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('Create Entry'));
    const errorsBefore = screen.getAllByText('Required field').length;
    expect(errorsBefore).toBe(5);

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Test' } });

    const errorsAfter = screen.getAllByText('Required field').length;
    expect(errorsAfter).toBe(errorsBefore - 1);
  });

  it('shows loading state on submit button while saving', async () => {
    renderDrawer();
    fillRequiredFields();
    fireEvent.click(screen.getByText('Create Entry'));
    const button = screen.getByText('Create Entry').closest('button')!;
    expect(button).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(500); });
  });

  it('calls onSaved after successful create', async () => {
    const onSaved = vi.fn();
    renderDrawer({ onSaved });
    fillRequiredFields();
    fireEvent.click(screen.getByText('Create Entry'));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByText('Entry created successfully')).toBeInTheDocument();
  });

  it('populates form fields in edit mode from entry data', () => {
    renderDrawer({ entryId: 'fin-01' });
    act(() => { vi.advanceTimersByTime(200); });
    const amountInput = screen.getByLabelText('Amount') as HTMLInputElement;
    expect(amountInput.value).toBe('350');
  });

  it('disables entryType select in edit mode', () => {
    renderDrawer({ entryId: 'fin-01' });
    act(() => { vi.advanceTimersByTime(200); });
    const typeButton = screen.getByLabelText('Type') as HTMLButtonElement;
    expect(typeButton).toBeDisabled();
  });

  it('shows confirm dialog when cancelling dirty form', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Dirty' } });
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Discard changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes without confirm dialog when form is clean', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });
});
