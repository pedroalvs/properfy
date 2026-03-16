import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageSectionHeader } from './PageSectionHeader';

describe('PageSectionHeader', () => {
  it('renders title', () => {
    render(<PageSectionHeader title="Agendamentos" />);
    expect(screen.getByText('Agendamentos')).toBeInTheDocument();
  });

  it('renders count when provided', () => {
    render(<PageSectionHeader title="Vistorias" count={12} />);
    expect(screen.getByText('(12)')).toBeInTheDocument();
  });

  it('does not render count when not provided', () => {
    const { container } = render(<PageSectionHeader title="Vistorias" />);
    expect(container.textContent).not.toContain('(');
  });

  it('renders action button and handles click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<PageSectionHeader title="Vistorias" action={{ label: 'Ver todos', onClick }} />);
    await user.click(screen.getByText('Ver todos'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render action when not provided', () => {
    render(<PageSectionHeader title="Vistorias" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
