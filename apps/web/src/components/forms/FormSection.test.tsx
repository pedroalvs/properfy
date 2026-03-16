import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormSection } from './FormSection';

describe('FormSection', () => {
  it('renders title', () => {
    render(
      <FormSection title="Dados Pessoais">
        <div>field</div>
      </FormSection>,
    );
    expect(screen.getByText('Dados Pessoais')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(
      <FormSection title="Info" description="Preencha os campos abaixo">
        <div>field</div>
      </FormSection>,
    );
    expect(screen.getByText('Preencha os campos abaixo')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <FormSection>
        <div data-testid="child">input</div>
      </FormSection>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('applies 2-column grid when columns is 2', () => {
    const { container } = render(
      <FormSection columns={2}>
        <div>a</div>
        <div>b</div>
      </FormSection>,
    );
    const grid = container.querySelector('.md\\:grid-cols-2');
    expect(grid).toBeInTheDocument();
  });

  it('defaults to 1-column layout', () => {
    const { container } = render(
      <FormSection>
        <div>a</div>
      </FormSection>,
    );
    const grid = container.querySelector('.grid-cols-1');
    expect(grid).toBeInTheDocument();
    expect(container.querySelector('.md\\:grid-cols-2')).not.toBeInTheDocument();
  });
});
