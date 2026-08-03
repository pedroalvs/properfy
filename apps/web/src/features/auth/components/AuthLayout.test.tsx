import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthLayout } from './AuthLayout';

function renderLayout(children: React.ReactNode = <p>form goes here</p>) {
  return render(
    <AuthLayout title="We are Properfy" subtitle="Welcome. Please log in.">
      {children}
    </AuthLayout>,
  );
}

describe('AuthLayout', () => {
  it('renders the title as the page heading, the subtitle and its children', () => {
    renderLayout();

    expect(screen.getByRole('heading', { level: 1, name: 'We are Properfy' })).toBeInTheDocument();
    expect(screen.getByText('Welcome. Please log in.')).toBeInTheDocument();
    expect(screen.getByText('form goes here')).toBeInTheDocument();
  });

  /**
   * The pane repeats the brand the heading already states, so exposing it would make a
   * screen reader announce "Properfy" twice before reaching the form.
   */
  it('keeps the decorative brand pane out of the accessibility tree', () => {
    renderLayout();

    expect(screen.getByTestId('auth-brand-pane')).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes exactly one brand image to assistive tech, on the compact lockup', () => {
    renderLayout();

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAccessibleName('Properfy');
  });
});
