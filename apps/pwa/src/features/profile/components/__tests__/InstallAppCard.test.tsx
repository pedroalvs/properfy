import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InstallAppCard } from '../InstallAppCard';

const mockUseInstallPrompt = vi.fn();

vi.mock('@/app/useInstallPrompt', () => ({
  useInstallPrompt: () => mockUseInstallPrompt(),
}));

describe('InstallAppCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows manual instructions when the browser does not expose the prompt', () => {
    mockUseInstallPrompt.mockReturnValue({
      isInstalled: false,
      canInstall: false,
      manualInstructions: 'Use browser menu to install',
      promptInstall: vi.fn(),
    });

    render(<InstallAppCard />);
    expect(screen.getByText('Install Properfy')).toBeInTheDocument();
    expect(screen.getByText('Use browser menu to install')).toBeInTheDocument();
  });

  it('shows install action and triggers prompt', async () => {
    const promptInstall = vi.fn().mockResolvedValue(true);
    mockUseInstallPrompt.mockReturnValue({
      isInstalled: false,
      canInstall: true,
      manualInstructions: null,
      promptInstall,
    });

    render(<InstallAppCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Install App' }));

    await waitFor(() => {
      expect(promptInstall).toHaveBeenCalled();
    });
  });
});
