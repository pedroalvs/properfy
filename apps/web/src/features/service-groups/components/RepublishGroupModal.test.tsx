import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RepublishGroupModal } from './RepublishGroupModal';

describe('RepublishGroupModal', () => {
  it('renders dialog when open', () => {
    render(
      <RepublishGroupModal
        open={true}
        onClose={vi.fn()}
        onRepublish={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(screen.getByText('Republish Service Group')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <RepublishGroupModal
        open={false}
        onClose={vi.fn()}
        onRepublish={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(screen.queryByText('Republish Service Group')).not.toBeInTheDocument();
  });

  it('shows info message', () => {
    render(
      <RepublishGroupModal
        open={true}
        onClose={vi.fn()}
        onRepublish={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(
      screen.getByText(/This will move the service group back to DRAFT status/),
    ).toBeInTheDocument();
  });

  it('has Republish button always enabled even without reason', () => {
    render(
      <RepublishGroupModal
        open={true}
        onClose={vi.fn()}
        onRepublish={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    expect(screen.getByRole('button', { name: 'Republish' })).not.toBeDisabled();
  });

  it('calls onRepublish with reason when provided', () => {
    const onRepublish = vi.fn();
    render(
      <RepublishGroupModal
        open={true}
        onClose={vi.fn()}
        onRepublish={onRepublish}
        serviceGroupId="sg-01"
      />,
    );
    fireEvent.change(screen.getByLabelText('Republish reason'), {
      target: { value: 'Need to reassign inspector' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Republish' }));
    expect(onRepublish).toHaveBeenCalledWith('Need to reassign inspector');
  });

  it('calls onRepublish with undefined when no reason', () => {
    const onRepublish = vi.fn();
    render(
      <RepublishGroupModal
        open={true}
        onClose={vi.fn()}
        onRepublish={onRepublish}
        serviceGroupId="sg-01"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Republish' }));
    expect(onRepublish).toHaveBeenCalledWith(undefined);
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <RepublishGroupModal
        open={true}
        onClose={onClose}
        onRepublish={vi.fn()}
        serviceGroupId="sg-01"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
