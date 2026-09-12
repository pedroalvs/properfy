import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DonePanel } from '../DonePanel';
import { renderWithProviders } from '@/test-utils';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('DonePanel', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders success message', () => {
    renderWithProviders(<DonePanel />);
    expect(screen.getByText('Inspection Complete')).toBeInTheDocument();
  });

  it('navigates to schedule on button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DonePanel />);
    await user.click(screen.getByTestId('back-to-schedule'));
    expect(mockNavigate).toHaveBeenCalledWith('/schedule');
  });

  it('shows the offline pendingSync message and still navigates back to schedule', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DonePanel pendingSync onBack={onBack} />);

    expect(screen.getByText('Inspection Saved Locally')).toBeInTheDocument();
    expect(screen.queryByText('Inspection Complete')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('back-to-schedule'));
    expect(onBack).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/schedule');
  });
});
