import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('keeps the label out of the document until the trigger is hovered', () => {
    render(
      <Tooltip label="Note: come after 2pm">
        <i className="mdi mdi-note-text-outline" aria-label="Note: come after 2pm" />
      </Tooltip>,
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the label on hover and hides it again on unhover', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="Note: come after 2pm">
        <span>icon</span>
      </Tooltip>,
    );

    await user.hover(screen.getByText('icon'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Note: come after 2pm');

    await user.unhover(screen.getByText('icon'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the label on keyboard focus', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="Note: come after 2pm">
        <span>icon</span>
      </Tooltip>,
    );

    await user.tab();

    expect(screen.getByRole('tooltip')).toHaveTextContent('Note: come after 2pm');
  });

  it('dismisses on Escape while the trigger stays focused', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="Note: come after 2pm">
        <span>icon</span>
      </Tooltip>,
    );

    await user.tab();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('renders the bubble outside the trigger so a scroll container cannot clip it', async () => {
    const user = userEvent.setup();
    render(
      <div data-testid="clipping-container" className="overflow-y-auto">
        <Tooltip label="Note: come after 2pm">
          <span>icon</span>
        </Tooltip>
      </div>,
    );

    await user.hover(screen.getByText('icon'));

    const container = screen.getByTestId('clipping-container');
    expect(container).not.toContainElement(screen.getByRole('tooltip'));
  });

  it('describes the trigger with the tooltip while it is open', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="Note: come after 2pm">
        <span>icon</span>
      </Tooltip>,
    );

    await user.hover(screen.getByText('icon'));

    const trigger = screen.getByText('icon').parentElement as HTMLElement;
    expect(trigger).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
  });
});
