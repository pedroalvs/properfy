import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeaveWarningModal } from '../LeaveWarningModal';

describe('LeaveWarningModal', () => {
  const onStay = vi.fn();
  const onLeave = vi.fn();

  beforeEach(() => {
    onStay.mockClear();
    onLeave.mockClear();
  });

  it('renders warning message', () => {
    render(<LeaveWarningModal onStay={onStay} onLeave={onLeave} />);
    expect(screen.getByText('Leave inspection?')).toBeInTheDocument();
    expect(screen.getByText(/inspection in progress/)).toBeInTheDocument();
  });

  it('calls onStay when Stay is clicked', async () => {
    const user = userEvent.setup();
    render(<LeaveWarningModal onStay={onStay} onLeave={onLeave} />);
    await user.click(screen.getByTestId('stay-button'));
    expect(onStay).toHaveBeenCalledOnce();
  });

  it('calls onLeave when Leave is clicked', async () => {
    const user = userEvent.setup();
    render(<LeaveWarningModal onStay={onStay} onLeave={onLeave} />);
    await user.click(screen.getByTestId('leave-button'));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('renders with correct test ids', () => {
    render(<LeaveWarningModal onStay={onStay} onLeave={onLeave} />);
    expect(screen.getByTestId('leave-warning-modal')).toBeInTheDocument();
    expect(screen.getByTestId('stay-button')).toBeInTheDocument();
    expect(screen.getByTestId('leave-button')).toBeInTheDocument();
  });

  it('keeps its actions clear of the iOS home indicator', () => {
    // The Radix dialog content (portaled to body) carries the home-indicator inset.
    render(<LeaveWarningModal onStay={onStay} onLeave={onLeave} />);
    expect(screen.getByTestId('leave-warning-modal').className).toContain('pb-safe-b-6');
  });

  it('exposes real alertdialog semantics: role, accessible name/description, and initial focus on Stay', () => {
    render(<LeaveWarningModal onStay={onStay} onLeave={onLeave} />);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Leave inspection?');
    expect(dialog).toHaveAccessibleDescription(/inspection in progress/);

    expect(document.activeElement).toBe(screen.getByTestId('stay-button'));
  });

  it('cannot be dismissed by Escape or an outside click — it forces a Stay/Leave choice', async () => {
    const user = userEvent.setup();
    render(<LeaveWarningModal onStay={onStay} onLeave={onLeave} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    // There is no scrim element to click (the overlay is non-dismissing); pressing
    // Escape is the only ambient dismissal path and it is suppressed.
    await user.keyboard('{Escape}');

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onStay).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });
});
