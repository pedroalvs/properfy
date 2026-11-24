import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mutable so a test can simulate an unresolved (empty) app URL.
const envState = vi.hoisted(() => ({ pwaUrl: 'https://pwa.example.test' }));
vi.mock('@/config/env', () => ({
  env: {
    apiBaseUrl: 'http://localhost:3000',
    mapboxToken: '',
    get pwaUrl() {
      return envState.pwaUrl;
    },
  },
}));

import { InspectorAppRedirectModal } from './InspectorAppRedirectModal';

describe('InspectorAppRedirectModal', () => {
  beforeEach(() => {
    envState.pwaUrl = 'https://pwa.example.test';
  });

  it('renders the approved title, body and app link, and nothing when closed', () => {
    const { rerender } = render(<InspectorAppRedirectModal open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<InspectorAppRedirectModal open onClose={() => {}} />);

    expect(
      screen.getByRole('heading', { name: 'Inspectors use the Properfy app' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your account doesn't have access to this website. Open the Properfy Inspector app to see your offers and schedule.",
      ),
    ).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'Open the app' });
    expect(link).toHaveAttribute('href', 'https://pwa.example.test');
  });

  it('calls onClose when the dialog is dismissed', () => {
    const onClose = vi.fn();
    render(<InspectorAppRedirectModal open onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a disabled button (never a broken link) when the app URL is empty', () => {
    envState.pwaUrl = '';
    render(<InspectorAppRedirectModal open onClose={() => {}} />);

    expect(screen.queryByRole('link', { name: 'Open the app' })).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Open the app' });
    expect(button).toBeDisabled();
  });
});
