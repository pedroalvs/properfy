import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailRow } from './DetailRow';

describe('DetailRow', () => {
  it('renders label and string value', () => {
    render(<DetailRow label="Nome" value="João Silva" />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('João Silva')).toBeInTheDocument();
  });

  it('renders ReactNode value', () => {
    render(<DetailRow label="Status" value={<span data-testid="chip">Ativo</span>} />);
    expect(screen.getByTestId('chip')).toBeInTheDocument();
  });

  it('shows em dash for empty value', () => {
    render(<DetailRow label="Telefone" value="" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('passes className through', () => {
    const { container } = render(<DetailRow label="X" value="Y" className="border-b" />);
    expect(container.firstChild).toHaveClass('border-b');
  });

  it('stacks content on mobile and restores row layout on larger screens', () => {
    const { container } = render(<DetailRow label="X" value="Y" />);
    expect(container.firstChild).toHaveClass('flex-col');
    expect(container.firstChild).toHaveClass('sm:flex-row');
  });
});
