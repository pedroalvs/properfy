import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GoalsRewardsPage, BACK_TO } from './GoalsRewardsPage';

// The tab bodies are tested on their own; here the shell just routes between them.
vi.mock('../components/GoalsTab', () => ({ GoalsTab: () => <div data-testid="goals-tab" /> }));
vi.mock('../components/RewardsTab', () => ({ RewardsTab: () => <div data-testid="rewards-tab" /> }));

function renderPage(entry = '/goals-rewards') {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[entry]}>
      <GoalsRewardsPage />
    </MemoryRouter>,
  );
}

describe('GoalsRewardsPage shell', () => {
  it('renders the header, subtitle and a tablist with Goals and Rewards', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Goals & rewards' })).toBeInTheDocument();
    expect(screen.getByText('Set goals for inspectors and review the rewards they earn.')).toBeInTheDocument();
    const tablist = screen.getByRole('tablist');
    expect(within(tablist).getByRole('tab', { name: 'Goals' })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: 'Rewards' })).toBeInTheDocument();
  });

  it('defaults to the Goals tab', () => {
    renderPage();
    expect(screen.getByTestId('goals-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('rewards-tab')).not.toBeInTheDocument();
  });

  it('opens the Rewards tab from ?tab=rewards', () => {
    renderPage('/goals-rewards?tab=rewards');
    expect(screen.getByTestId('rewards-tab')).toBeInTheDocument();
  });

  it('switches to Rewards on click', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: 'Rewards' }));
    expect(screen.getByTestId('rewards-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('goals-tab')).not.toBeInTheDocument();
  });

  it('exports the shared back-to constant', () => {
    expect(BACK_TO).toBe('/goals-rewards?tab=goals');
  });
});
