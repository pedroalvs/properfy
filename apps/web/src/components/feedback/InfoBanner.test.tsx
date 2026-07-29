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
  it('uses the alert role and error styling for the error variant', () => {
    render(<InfoBanner variant="error">Something broke</InfoBanner>);
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Something broke');
    expect(banner.className).toContain('text-error');
  });

  it('keeps the status role for info and warning', () => {
    const { rerender } = render(<InfoBanner variant="info">Info</InfoBanner>);
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(<InfoBanner variant="warning">Warn</InfoBanner>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
