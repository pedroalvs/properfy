import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManualAssignModal } from './ManualAssignModal';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
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
    expect(screen.getByPlaceholderText('Search by name or email')).toBeInTheDocument();
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
