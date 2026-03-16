import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormActions } from './FormActions';

describe('FormActions', () => {
  it('renders children buttons', () => {
    render(
      <FormActions>
        <button>Salvar</button>
        <button>Cancelar</button>
      </FormActions>,
    );
    expect(screen.getByText('Salvar')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });

  it('right-aligns by default', () => {
    const { container } = render(
      <FormActions>
        <button>Salvar</button>
      </FormActions>,
    );
    expect(container.firstChild).toHaveClass('justify-end');
  });

  it('left-aligns when align is left', () => {
    const { container } = render(
      <FormActions align="left">
        <button>Salvar</button>
      </FormActions>,
    );
    expect(container.firstChild).toHaveClass('justify-start');
  });

  it('passes className through', () => {
    const { container } = render(
      <FormActions className="mt-6">
        <button>Salvar</button>
      </FormActions>,
    );
    expect(container.firstChild).toHaveClass('mt-6');
  });
});
