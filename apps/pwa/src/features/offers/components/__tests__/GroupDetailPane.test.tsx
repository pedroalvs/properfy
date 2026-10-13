import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GroupDetailPane } from '../GroupDetailPane';

// The body + footer are covered by GroupDetailContent's own tests; stub it here so this
// test focuses on the pane chrome (header, close control, disabled-while-accepting).
vi.mock('../GroupDetailContent', () => ({
  GroupDetailContent: ({ groupId }: { groupId: string | null }) => (
    <div data-testid="group-detail-content">{groupId}</div>
  ),
}));

describe('GroupDetailPane', () => {
  it('renders the detail content for the selected group', () => {
    render(<GroupDetailPane groupId="grp-9" onClose={vi.fn()} />);
    expect(screen.getByTestId('group-detail-pane')).toBeInTheDocument();
    expect(screen.getByTestId('group-detail-content')).toHaveTextContent('grp-9');
    expect(screen.getByText('Inspection details')).toBeInTheDocument();
  });

  it('closes via the close control', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<GroupDetailPane groupId="grp-9" onClose={onClose} />);
    await user.click(screen.getByTestId('detail-pane-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('inert close while accepting (cannot abandon an in-flight acceptance)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<GroupDetailPane groupId="grp-9" onClose={onClose} accepting />);
    const close = screen.getByTestId('detail-pane-close');
    expect(close).toBeDisabled();
    await user.click(close);
    expect(onClose).not.toHaveBeenCalled();
  });
});
