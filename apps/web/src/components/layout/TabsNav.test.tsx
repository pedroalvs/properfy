import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabsNav } from './TabsNav';

const tabs = [
  { id: 'geral', label: 'Geral' },
  { id: 'financeiro', label: 'Financeiro', badge: 3 },
  { id: 'historico', label: 'Histórico' },
];

describe('TabsNav', () => {
  it('renders tablist role', () => {
    render(<TabsNav tabs={tabs} activeTab="geral" onChange={() => {}} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('renders all tabs', () => {
    render(<TabsNav tabs={tabs} activeTab="geral" onChange={() => {}} />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('marks active tab with aria-selected', () => {
    render(<TabsNav tabs={tabs} activeTab="financeiro" onChange={() => {}} />);
    const activeTab = screen.getByRole('tab', { name: /Financeiro/ });
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
    const inactiveTab = screen.getByRole('tab', { name: 'Geral' });
    expect(inactiveTab).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange when tab is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TabsNav tabs={tabs} activeTab="geral" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: /Financeiro/ }));
    expect(onChange).toHaveBeenCalledWith('financeiro');
  });

  it('renders badge on tab', () => {
    render(<TabsNav tabs={tabs} activeTab="geral" onChange={() => {}} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders slider element', () => {
    render(<TabsNav tabs={tabs} activeTab="geral" onChange={() => {}} />);
    const slider = screen.getByTestId('tab-slider');
    expect(slider).toBeInTheDocument();
    expect(slider.className).toContain('bg-real-estate');
    expect(slider.className).toContain('transition-all');
  });

  it('applies active text color to active tab', () => {
    render(<TabsNav tabs={tabs} activeTab="geral" onChange={() => {}} />);
    const activeTab = screen.getByRole('tab', { name: 'Geral' });
    expect(activeTab.className).toContain('text-secondary');
  });

  it('applies inactive text color to inactive tabs', () => {
    render(<TabsNav tabs={tabs} activeTab="geral" onChange={() => {}} />);
    const inactiveTab = screen.getByRole('tab', { name: 'Histórico' });
    expect(inactiveTab.className).toContain('text-[#999999]');
  });
});
