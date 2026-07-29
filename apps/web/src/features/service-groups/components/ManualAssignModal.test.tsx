import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManualAssignModal } from './ManualAssignModal';

const INSPECTOR = { id: 'insp-9', name: 'Ana Costa', email: 'ana@example.com' };

// The modal loads its list through the generated client; without this the list
// is empty and a "submit is disabled" assertion proves nothing.
vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(async () => ({
      data: { data: [{ id: 'insp-9', name: 'Ana Costa', email: 'ana@example.com' }] },
    })),
  },
}));

// A client per render: a shared one carries the inspector list between tests,
// so whichever test ran first would silently rob the next of its loading state.
function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('ManualAssignModal', () => {
  it('renders dialog when open', () => {
    render(
      <ManualAssignModal
        open={true}
        onClose={vi.fn()}
        onAssign={vi.fn()}
        serviceGroupId="sg-01"
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText('Assign Inspector')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <ManualAssignModal
        open={false}
        onClose={vi.fn()}
        onAssign={vi.fn()}
        serviceGroupId="sg-01"
      />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByText('Assign Inspector')).not.toBeInTheDocument();
  });

  it('has disabled Assign button when input is empty', () => {
    render(
      <ManualAssignModal
        open={true}
        onClose={vi.fn()}
        onAssign={vi.fn()}
        serviceGroupId="sg-01"
      />,
      { wrapper: Wrapper },
    );
    const button = screen.getByRole('button', { name: 'Assign' });
    expect(button).toBeDisabled();
  });

  it('renders search input with placeholder', () => {
    render(
      <ManualAssignModal
        open={true}
        onClose={vi.fn()}
        onAssign={vi.fn()}
        serviceGroupId="sg-01"
      />,
      { wrapper: Wrapper },
    );
    // FilterInput is the app's only debounced search primitive (apps/web/CLAUDE.md).
    // At rest it shows the label as placeholder; the hint text takes over once
    // the floating label lifts.
    expect(screen.getByPlaceholderText('Search inspectors')).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <ManualAssignModal
        open={true}
        onClose={onClose}
        onAssign={vi.fn()}
        serviceGroupId="sg-01"
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows loading state when fetching inspectors', () => {
    render(
      <ManualAssignModal
        open={true}
        onClose={vi.fn()}
        onAssign={vi.fn()}
        serviceGroupId="sg-01"
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText('Loading inspectors...')).toBeInTheDocument();
  });
});

describe('ManualAssignModal replacement mode', () => {
  const currentInspector = { id: 'insp-old', name: 'Carlos Silva' };

  function renderReplacement(onAssign = vi.fn()) {
    render(
      <ManualAssignModal
        open={true}
        onClose={vi.fn()}
        onAssign={onAssign}
        serviceGroupId="sg-01"
        currentInspector={currentInspector}
        isReplacement
      />,
      { wrapper: Wrapper },
    );
    return onAssign;
  }

  it('names the action as a replacement', () => {
    renderReplacement();
    expect(screen.getByText('Change Inspector')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace inspector' })).toBeInTheDocument();
  });

  it('warns that both inspectors will be notified', () => {
    renderReplacement();
    expect(screen.getByText(/will notify/i)).toBeInTheDocument();
    expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
  });

  it('requires a reason even once an inspector is chosen', async () => {
    renderReplacement();

    // Select first, so the only thing still missing is the reason — otherwise
    // this passes on the empty selection alone and would survive deleting the
    // reason requirement entirely.
    fireEvent.click(await screen.findByText(INSPECTOR.name));
    expect(screen.getByRole('button', { name: 'Replace inspector' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Inspector unavailable' } });
    expect(screen.getByRole('button', { name: 'Replace inspector' })).toBeEnabled();
  });

  it('rejects a whitespace-only reason', async () => {
    renderReplacement();
    fireEvent.click(await screen.findByText(INSPECTOR.name));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Replace inspector' })).toBeDisabled();
  });

  it('passes the trimmed reason to the caller', async () => {
    const onAssign = renderReplacement();
    fireEvent.click(await screen.findByText(INSPECTOR.name));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '  Inspector unavailable  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Replace inspector' }));

    expect(onAssign).toHaveBeenCalledWith(INSPECTOR.id, 'Inspector unavailable');
  });

  it('does not render the reason field in plain assignment mode', () => {
    render(
      <ManualAssignModal open={true} onClose={vi.fn()} onAssign={vi.fn()} serviceGroupId="sg-01" />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
  });
});
