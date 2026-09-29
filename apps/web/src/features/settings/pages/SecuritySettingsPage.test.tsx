import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SecuritySettingsPage } from './SecuritySettingsPage';

describe('SecuritySettingsPage', () => {
  it('redirects to the account page Security tab', () => {
    render(
      <MemoryRouter initialEntries={['/settings/security']}>
        <Routes>
          <Route path="/settings/security" element={<SecuritySettingsPage />} />
          <Route path="/settings/account" element={<div>Account Settings Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // The redirect lands on the account route (which then reads ?tab=security).
    expect(screen.getByText('Account Settings Page')).toBeInTheDocument();
  });
});
