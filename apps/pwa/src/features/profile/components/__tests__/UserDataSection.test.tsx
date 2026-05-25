import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { UserDataSection } from '../UserDataSection';

const INSPECTOR_ID = 'insp-1';

describe('UserDataSection', () => {
  it('renders phone value as text', () => {
    renderWithProviders(
      <UserDataSection inspectorId={INSPECTOR_ID} phone="+61400000001" />,
    );
    expect(screen.getByText('+61400000001')).toBeInTheDocument();
  });

  it('renders dash when phone is null', () => {
    renderWithProviders(<UserDataSection inspectorId={INSPECTOR_ID} phone={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders bank details managed-by-ops message', () => {
    renderWithProviders(<UserDataSection inspectorId={INSPECTOR_ID} phone={null} />);
    expect(screen.getByText(/payment settings and region assignments are managed by your operations team/i)).toBeInTheDocument();
  });

  it('renders My Details label', () => {
    renderWithProviders(<UserDataSection inspectorId={INSPECTOR_ID} phone={null} />);
    expect(screen.getByText('My Details')).toBeInTheDocument();
  });

  it('does not render any input or save button', () => {
    renderWithProviders(<UserDataSection inspectorId={INSPECTOR_ID} phone="+61400000001" />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
