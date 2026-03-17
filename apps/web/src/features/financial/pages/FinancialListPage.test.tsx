import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { FinancialListPage } from './FinancialListPage';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarProvider>{children}</SnackbarProvider>
  );
}

function renderPage() {
  return render(
    <Wrapper>
      <FinancialListPage />
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FinancialListPage', () => {
  it('renders page title "Financial"', () => {
    renderPage();
    expect(screen.getByText('Financial')).toBeInTheDocument();
  });

  it('renders "New Entry" CTA button', () => {
    renderPage();
    const matches = screen.getAllByText('New Entry');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search, type, and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    const typeLabels = screen.getAllByLabelText('Type');
    expect(typeLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with financial data after loading', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('VIST-001')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderPage();
    expect(screen.getByText('Inspection')).toBeInTheDocument();
    expect(screen.queryByText('VIST-001')).not.toBeInTheDocument();
  });

  it('clicking view icon opens drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('View')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Identification')).toBeInTheDocument();
  });

  it('drawer shows correct financial data', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('View')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('Débito vistoria residencial Centro');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('closing drawer resets state', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('View')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Identification')).toBeInTheDocument();
    const narrowDrawer = document.querySelector('.w-drawer-narrow') as HTMLElement;
    const closeButton = within(narrowDrawer).getByLabelText('Fechar');
    fireEvent.click(closeButton);
    act(() => { vi.advanceTimersByTime(0); });
    expect(narrowDrawer).toHaveClass('translate-x-full');
  });

  it('clicking different row updates drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButtons = screen.getAllByLabelText('View');
    fireEvent.click(viewButtons[0]!);
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('Débito vistoria residencial Centro');
    expect(matches.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(viewButtons[1]!);
    act(() => { vi.advanceTimersByTime(200); });
    const matches2 = screen.getAllByText('Pagamento inspetor Diego - vistoria Centro');
    expect(matches2.length).toBeGreaterThanOrEqual(1);
  });

  it('drawer renders within page', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('View')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
  });

  it('clicking "New Entry" opens form drawer with "Create Entry" submit button', () => {
    renderPage();
    const newEntryButtons = screen.getAllByText('New Entry');
    fireEvent.click(newEntryButtons[0]!);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByText('Create Entry')).toBeInTheDocument();
  });

  it('form drawer renders all form sections', () => {
    renderPage();
    const newEntryButtons = screen.getAllByText('New Entry');
    fireEvent.click(newEntryButtons[0]!);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByText('Type & Values')).toBeInTheDocument();
    const detailsMatches = screen.getAllByText('Details');
    expect(detailsMatches.length).toBeGreaterThanOrEqual(1);
    const notesMatches = screen.getAllByText('Notes');
    expect(notesMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('closing form drawer hides form content', () => {
    renderPage();
    const newEntryButtons = screen.getAllByText('New Entry');
    fireEvent.click(newEntryButtons[0]!);
    act(() => { vi.advanceTimersByTime(0); });
    const wideDrawer = document.querySelector('.w-drawer-wide') as HTMLElement;
    expect(wideDrawer).not.toHaveClass('translate-x-full');
    const closeButton = within(wideDrawer).getByLabelText('Fechar');
    fireEvent.click(closeButton);
    act(() => { vi.advanceTimersByTime(0); });
    expect(wideDrawer).toHaveClass('translate-x-full');
  });

  it('edit from detail drawer opens form drawer with "Edit Entry" title', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('View')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    const narrowDrawer = document.querySelector('.w-drawer-narrow') as HTMLElement;
    const editButton = within(narrowDrawer).getByLabelText('Editar');
    fireEvent.click(editButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Edit Entry')).toBeInTheDocument();
  });

  it('"New Entry" button is present and clickable', () => {
    renderPage();
    const newEntryButtons = screen.getAllByText('New Entry');
    expect(newEntryButtons.length).toBeGreaterThanOrEqual(1);
    expect(() => fireEvent.click(newEntryButtons[0]!)).not.toThrow();
  });
});
