import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ServiceGroupActionsMenu } from './ServiceGroupActionsMenu';

const handlers = {
  onChangeInspector: vi.fn(),
  onChangeDate: vi.fn(),
  onChangeTimeWindow: vi.fn(),
};

function renderMenu(isReplacement = false) {
  return render(<ServiceGroupActionsMenu isReplacement={isReplacement} {...handlers} />);
}

const openMenu = () => fireEvent.click(screen.getByTestId('service-group-change-trigger'));

describe('ServiceGroupActionsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides its items until the trigger is clicked', () => {
    renderMenu();
    expect(screen.queryByTestId('group-action-change-date')).not.toBeInTheDocument();

    openMenu();
    expect(screen.getByTestId('group-action-change-date')).toBeInTheDocument();
  });

  it.each([
    ['group-action-change-inspector', 'onChangeInspector'],
    ['group-action-change-date', 'onChangeDate'],
    ['group-action-change-time-window', 'onChangeTimeWindow'],
  ] as const)('%s fires %s', (testId, handler) => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByTestId(testId));
    expect(handlers[handler]).toHaveBeenCalledTimes(1);
  });

  it('labels the inspector item by whether the group already has one', () => {
    const { unmount } = renderMenu(false);
    openMenu();
    expect(screen.getByTestId('group-action-change-inspector')).toHaveTextContent('Assign inspector');
    unmount();

    renderMenu(true);
    openMenu();
    expect(screen.getByTestId('group-action-change-inspector')).toHaveTextContent('Change inspector');
  });

  it('closes after a selection', () => {
    // ViewportAwareDropdown is uncontrolled and ignores clicks inside its own
    // menu, so without the remount the menu would linger behind the dialog.
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByTestId('group-action-change-date'));

    expect(screen.queryByTestId('group-action-change-date')).not.toBeInTheDocument();
  });
});
