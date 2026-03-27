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

  it('renders nothing when install is not available', () => {
    mockUseInstallPrompt.mockReturnValue({
      canInstall: false,
      promptInstall: vi.fn(),
    });

    const { container } = render(<InstallAppCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows install action and triggers prompt', async () => {
    const promptInstall = vi.fn().mockResolvedValue(true);
    mockUseInstallPrompt.mockReturnValue({
      canInstall: true,
      promptInstall,
    });

    render(<InstallAppCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Install App' }));

    await waitFor(() => {
      expect(promptInstall).toHaveBeenCalled();
    });
  });
});
