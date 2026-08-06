import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  /**
   * The pane now carries a wordmark of its own. This is the test that fails if anyone
   * gives it an `alt`, which would make a screen reader read the brand twice over.
   */
  it('exposes exactly one brand image to assistive tech, on the compact lockup', () => {
    renderLayout();

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAccessibleName('Properfy');
  });

  it('draws the round inside the brand pane', () => {
    renderLayout();

    expect(screen.getByTestId('auth-brand-pane')).toContainElement(screen.getByTestId('route-art'));
  });

  /**
   * `auth-pane-reveal` is the hook every rule in styles/auth-pane.css is scoped under,
   * including the reduced-motion guard. Drop the class and the artwork renders in its
   * resting state — a fully retracted route, i.e. nothing.
   */
  it('arms the load reveal on the pane', () => {
    renderLayout();

    expect(screen.getByTestId('auth-brand-pane')).toHaveClass('auth-pane-reveal');
  });
});

/**
 * The login screen moves the brand to the sheet: the heading becomes the logo and the
 * pane keeps only the tagline. Other auth screens keep textual titles, so the swap is
 * opt-in via `logoAsTitle`.
 */
describe('AuthLayout with logoAsTitle', () => {
  function renderSwapped() {
    return render(
      <AuthLayout title="We are Properfy" subtitle="Welcome. Please log in." logoAsTitle>
        <p>form goes here</p>
      </AuthLayout>,
    );
  }

  it('renders the logo as the page heading, named by the title', () => {
    renderSwapped();

    const heading = screen.getByRole('heading', { level: 1, name: 'We are Properfy' });
    expect(within(heading).getByRole('img')).toHaveAttribute(
      'src',
      '/images/properfy-logo-red.png',
    );
  });

  it('shows only the tagline on the brand pane — no logo, no wordmark text', () => {
    renderSwapped();

    const pane = screen.getByTestId('auth-brand-pane');
    expect(within(pane).queryByText('We are Properfy')).toBeNull();
    expect(pane.querySelector('img')).toBeNull();
    expect(
      within(pane).getByText('Inspection operations for Australian agencies.'),
    ).toBeInTheDocument();
  });

  it('exposes exactly one brand image to assistive tech, the heading logo', () => {
    renderSwapped();

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAccessibleName('We are Properfy');
  });
});
