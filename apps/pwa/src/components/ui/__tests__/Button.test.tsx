import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('renders every variant without crashing', () => {
    for (const variant of ['primary', 'secondary', 'outlined', 'success', 'danger', 'delete', 'icon'] as const) {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole('button', { name: variant })).toBeInTheDocument();
      unmount();
    }
  });

  it('signals loading: disabled, aria-busy and a spinner', () => {
    render(<Button loading>Loading</Button>);
    const button = screen.getByRole('button', { name: 'Loading' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('svg')).toBeInTheDocument();
  });

  it('disables when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick handler', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Click</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps a 44px touch target', () => {
    render(<Button>Touch</Button>);
    expect(screen.getByRole('button').className).toContain('min-h-touch');
  });

  it('merges a caller className over the variant classes', () => {
    render(<Button className="w-full">Wide</Button>);
    expect(screen.getByRole('button').className).toContain('w-full');
  });
});
