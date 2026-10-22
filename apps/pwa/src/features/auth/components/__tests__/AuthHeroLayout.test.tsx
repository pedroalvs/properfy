import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthHeroLayout } from '../AuthHeroLayout';

describe('AuthHeroLayout', () => {
  it('renders the title as the heading, the subtitle and the children', () => {
    render(
      <AuthHeroLayout title="Welcome back" subtitle="Sign in to view your schedule.">
        <button type="button">Sign In</button>
      </AuthHeroLayout>,
    );

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to view your schedule.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('renders without a subtitle', () => {
    render(
      <AuthHeroLayout title="Reset password">
        <div>form</div>
      </AuthHeroLayout>,
    );

    expect(screen.getByRole('heading', { name: 'Reset password' })).toBeInTheDocument();
  });

  it('shows the Properfy brand lockup in the hero', () => {
    render(
      <AuthHeroLayout title="Welcome back">
        <div />
      </AuthHeroLayout>,
    );

    expect(screen.getByAltText('Properfy')).toBeInTheDocument();
    expect(screen.getByText('Inspector Field App')).toBeInTheDocument();
  });

  it('marks the decorative route art as hidden from assistive tech', () => {
    render(
      <AuthHeroLayout title="Welcome back">
        <div />
      </AuthHeroLayout>,
    );

    expect(screen.getByTestId('route-art')).toHaveAttribute('aria-hidden', 'true');
  });
});
