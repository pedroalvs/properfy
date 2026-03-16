import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from './FormField';

describe('FormField', () => {
  it('renders label text', () => {
    render(
      <FormField label="Nome">
        <input />
      </FormField>,
    );
    expect(screen.getByText('Nome')).toBeInTheDocument();
  });

  it('renders required asterisk when required is true', () => {
    render(
      <FormField label="Email" required>
        <input />
      </FormField>,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('does not render asterisk when required is false', () => {
    render(
      <FormField label="Observação">
        <input />
      </FormField>,
    );
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('renders error message', () => {
    render(
      <FormField label="Nome" error="Campo obrigatório">
        <input />
      </FormField>,
    );
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
  });

  it('renders hint text', () => {
    render(
      <FormField label="Telefone" hint="Formato: (00) 00000-0000">
        <input />
      </FormField>,
    );
    expect(screen.getByText('Formato: (00) 00000-0000')).toBeInTheDocument();
  });

  it('error takes precedence over hint when both provided', () => {
    render(
      <FormField label="Nome" error="Obrigatório" hint="Dica qualquer">
        <input />
      </FormField>,
    );
    expect(screen.getByText('Obrigatório')).toBeInTheDocument();
    expect(screen.queryByText('Dica qualquer')).not.toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <FormField label="Nome">
        <input data-testid="my-input" />
      </FormField>,
    );
    expect(screen.getByTestId('my-input')).toBeInTheDocument();
  });

  it('passes className through', () => {
    const { container } = render(
      <FormField label="Nome" className="col-span-2">
        <input />
      </FormField>,
    );
    expect(container.firstChild).toHaveClass('col-span-2');
  });
});
