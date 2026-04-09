import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoPermissionState } from './NoPermissionState';

describe('NoPermissionState', () => {
  it('renders default message', () => {
    render(<NoPermissionState />);
    expect(
      screen.getByText("You don't have permission to view this content."),
    ).toBeInTheDocument();
  });

  it('renders custom message', () => {
    render(<NoPermissionState message="Access denied." />);
    expect(screen.getByText('Access denied.')).toBeInTheDocument();
  });

  it('renders lock icon', () => {
    const { container } = render(<NoPermissionState />);
    expect(container.querySelector('.mdi-lock-outline')).toBeTruthy();
  });

  it('renders action button and handles click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<NoPermissionState action={{ label: 'Go back', onClick }} />);
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render action when not provided', () => {
    render(<NoPermissionState />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has status role', () => {
    render(<NoPermissionState />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
