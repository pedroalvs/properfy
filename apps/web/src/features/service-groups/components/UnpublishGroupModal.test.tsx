import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnpublishGroupModal } from './UnpublishGroupModal';

describe('UnpublishGroupModal', () => {
  it('renders dialog when open', () => {
    render(<UnpublishGroupModal open={true} onClose={vi.fn()} onUnpublish={vi.fn()} />);
    expect(screen.getByText('Unpublish Service Group')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<UnpublishGroupModal open={false} onClose={vi.fn()} onUnpublish={vi.fn()} />);
    expect(screen.queryByText('Unpublish Service Group')).not.toBeInTheDocument();
  });

  it('spells out the effect on the group and its appointments', () => {
    render(<UnpublishGroupModal open={true} onClose={vi.fn()} onUnpublish={vi.fn()} />);
    expect(screen.getByText(/disappears from the inspector/)).toBeInTheDocument();
    expect(screen.getByText(/Awaiting Inspector/)).toBeInTheDocument();
  });

  it('keeps Unpublish disabled until a reason is typed', () => {
    render(<UnpublishGroupModal open={true} onClose={vi.fn()} onUnpublish={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Unpublish reason'), {
      target: { value: 'Wrong time window' },
    });
    expect(screen.getByRole('button', { name: 'Unpublish' })).not.toBeDisabled();
  });

  it('treats a whitespace-only reason as no reason', () => {
    const onUnpublish = vi.fn();
    render(<UnpublishGroupModal open={true} onClose={vi.fn()} onUnpublish={onUnpublish} />);

    fireEvent.change(screen.getByLabelText('Unpublish reason'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeDisabled();
    expect(onUnpublish).not.toHaveBeenCalled();
  });

  it('calls onUnpublish with the trimmed reason', () => {
    const onUnpublish = vi.fn();
    render(<UnpublishGroupModal open={true} onClose={vi.fn()} onUnpublish={onUnpublish} />);

    fireEvent.change(screen.getByLabelText('Unpublish reason'), {
      target: { value: '  Region was wrong  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));

    expect(onUnpublish).toHaveBeenCalledWith('Region was wrong');
  });

  it('calls onClose when Keep Published is clicked', () => {
    const onClose = vi.fn();
    render(<UnpublishGroupModal open={true} onClose={onClose} onUnpublish={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep Published' }));
    expect(onClose).toHaveBeenCalled();
  });
});
