import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PortalLayout } from './PortalLayout';

describe('PortalLayout', () => {
  it('renders the Properfy header', () => {
    render(<PortalLayout><div /></PortalLayout>);

    expect(screen.getByAltText('Properfy')).toBeInTheDocument();
  });

  it('renders children in the main area', () => {
    render(
      <PortalLayout>
        <p>Test child content</p>
      </PortalLayout>,
    );

    expect(screen.getByText('Test child content')).toBeInTheDocument();
  });

  it('renders the footer with current year', () => {
    render(<PortalLayout><div /></PortalLayout>);

    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(`Properfy.*${year}`))).toBeInTheDocument();
  });

  it('has a header, main and footer structure', () => {
    const { container } = render(
      <PortalLayout>
        <div data-testid="child" />
      </PortalLayout>,
    );

    expect(container.querySelector('header')).toBeInTheDocument();
    expect(container.querySelector('main')).toBeInTheDocument();
    expect(container.querySelector('footer')).toBeInTheDocument();
  });

  it('constrains main content width', () => {
    const { container } = render(
      <PortalLayout><div /></PortalLayout>,
    );

    const main = container.querySelector('main');
    expect(main?.className).toContain('max-w-[600px]');
  });
});
