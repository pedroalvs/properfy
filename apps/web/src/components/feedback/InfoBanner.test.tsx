import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfoBanner } from './InfoBanner';

describe('InfoBanner', () => {
  it('renders message text', () => {
    render(<InfoBanner>Selecione um cliente para acessar os movimentos</InfoBanner>);
    expect(screen.getByText('Selecione um cliente para acessar os movimentos')).toBeInTheDocument();
  });

  it('has status role', () => {
    render(<InfoBanner>Info message</InfoBanner>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
