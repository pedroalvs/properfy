import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationChannelIcons } from './ConfirmationChannelIcons';

/**
 * These icons live in the last column of the map bulk-action modal, inside a
 * `max-h-96 overflow-y-auto` wrapper. An absolutely positioned bubble is clipped
 * there — the reported bug was "Email — Awaiting tenant" cut off at the modal's
 * right edge. The contract asserted here is that the bubble escapes any
 * scroll container, which is what `Tooltip`'s portal buys us.
 */
describe('ConfirmationChannelIcons', () => {
  it('keeps the channel labels out of the document until hovered', () => {
    render(<ConfirmationChannelIcons rentalTenantConfirmationStatus="PENDING" />);

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('renders the label outside the scroll container so it cannot be clipped', async () => {
    const user = userEvent.setup();
    render(
      <div data-testid="scroll-container" className="max-h-96 overflow-y-auto">
        <ConfirmationChannelIcons rentalTenantConfirmationStatus="PENDING" />
      </div>,
    );

    await user.hover(screen.getByTestId('confirmation-email-icon'));

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Email — Awaiting tenant response');
    expect(screen.getByTestId('scroll-container')).not.toContainElement(tooltip);
  });

  it('describes the tenant confirmation state per channel', async () => {
    const user = userEvent.setup();
    render(<ConfirmationChannelIcons rentalTenantConfirmationStatus="CONFIRMED" />);

    await user.hover(screen.getByTestId('confirmation-sms-icon'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('SMS — Tenant confirmed');
  });

  it('explains a missing channel rather than showing a bare state', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmationChannelIcons rentalTenantConfirmationStatus="PENDING" hasSms={false} />,
    );

    await user.hover(screen.getByTestId('confirmation-sms-icon'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('SMS — no phone number on file');
  });
});
