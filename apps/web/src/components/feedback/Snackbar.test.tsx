import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { Snackbar } from './Snackbar';

function TestTrigger() {
  const { showSuccess, showError } = useSnackbar();
  return (
    <>
      <button onClick={() => showSuccess('Sucesso!')}>Success</button>
      <button onClick={() => showError('Erro!')}>Error</button>
    </>
  );
}

function renderWithProvider() {
  return render(
    <SnackbarProvider>
      <TestTrigger />
      <Snackbar />
    </SnackbarProvider>,
  );
}

describe('Snackbar', () => {
  it('does not render when there are no messages', () => {
    render(
      <SnackbarProvider>
        <Snackbar />
      </SnackbarProvider>,
    );
    expect(screen.queryByTestId('snackbar-container')).not.toBeInTheDocument();
  });

  it('shows success message when triggered', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText('Success'));
    expect(screen.getByText('Sucesso!')).toBeInTheDocument();
  });

  it('shows error message with error styling', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText('Error'));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Erro!');
    expect(alert.className).toContain('bg-snackbar-error');
  });

  it('dismisses message on close click', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText('Success'));
    expect(screen.getByText('Sucesso!')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Close'));
    expect(screen.queryByText('Sucesso!')).not.toBeInTheDocument();
  });

  it('auto-dismisses after 5 seconds', () => {
    vi.useFakeTimers();
    renderWithProvider();

    act(() => {
      fireEvent.click(screen.getByText('Success'));
    });
    expect(screen.getByText('Sucesso!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText('Sucesso!')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
