import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationSheet } from '../ConfirmationSheet';

describe('ConfirmationSheet', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  const baseProps = {
    icon: 'mdi-sync',
    iconClassName: 'text-primary',
    title: 'Confirm this?',
    confirmLabel: 'Yes',
    cancelLabel: 'No',
    onConfirm,
    onCancel,
    testId: 'sheet',
    confirmTestId: 'sheet-confirm',
    cancelTestId: 'sheet-cancel',
  };

  beforeEach(() => {
    onConfirm.mockClear();
    onCancel.mockClear();
  });

  it('exposes the description via aria-describedby when provided', () => {
    render(<ConfirmationSheet {...baseProps} description="Extra guidance here." />);
    expect(screen.getByRole('dialog', { name: 'Confirm this?' })).toHaveAccessibleDescription(
      'Extra guidance here.',
    );
  });

  it('has no aria-describedby without a description', () => {
    render(<ConfirmationSheet {...baseProps} />);
    expect(screen.getByRole('dialog', { name: 'Confirm this?' })).not.toHaveAttribute(
      'aria-describedby',
    );
  });

  it('wraps Tab from the last control back to the first', async () => {
    const user = userEvent.setup();
    render(<ConfirmationSheet {...baseProps} />);

    screen.getByTestId('sheet-cancel').focus();
    await user.tab();
    expect(screen.getByTestId('sheet-confirm')).toHaveFocus();
  });

  it('wraps Shift+Tab from the first control to the last', async () => {
    const user = userEvent.setup();
    render(<ConfirmationSheet {...baseProps} />);

    screen.getByTestId('sheet-confirm').focus();
    await user.tab({ shift: true });
    expect(screen.getByTestId('sheet-cancel')).toHaveFocus();
  });

  it('pulls focus back into the sheet when Tab is pressed with focus outside', async () => {
    const user = userEvent.setup();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    render(<ConfirmationSheet {...baseProps} />);

    outside.focus();
    await user.tab();
    expect(screen.getByTestId('sheet-confirm')).toHaveFocus();
    outside.remove();
  });

  it('keeps its actions clear of the iOS home indicator', () => {
    // The overlay is `items-end`, so the sheet is flush with the bottom edge, which
    // `viewport-fit=cover` puts under the ~34px home indicator. `p-6` alone leaves the
    // buttons 24px from that edge. The token adds the inset on top of the 24px, so the
    // *visible* spacing is unchanged on devices without an indicator.
    render(<ConfirmationSheet {...baseProps} />);
    expect(screen.getByRole('dialog').className).toContain('pb-safe-b-6');
  });
});
