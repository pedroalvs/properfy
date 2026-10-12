import { render, screen } from '@testing-library/react';
import { ScheduleOfflineBanner } from '../ScheduleOfflineBanner';

const mockUseIsOnline = vi.fn();

vi.mock('@/hooks/useIsOnline', () => ({
  useIsOnline: () => mockUseIsOnline(),
}));

describe('ScheduleOfflineBanner', () => {
  it('renders nothing while online', () => {
    mockUseIsOnline.mockReturnValue(true);
    const { container } = render(<ScheduleOfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a compact offline banner whose icon matches the text size', () => {
    mockUseIsOnline.mockReturnValue(false);
    render(<ScheduleOfflineBanner />);

    const banner = screen.getByTestId('schedule-offline-banner');
    expect(banner).toHaveTextContent('Viewing cached schedule');

    // The cloud-off icon sits inline with text-xs copy; it must be sized to it (~12px),
    // not left at the oversized default that towers over the label.
    const icon = banner.querySelector('.lucide-cloud-off');
    expect(icon).toHaveAttribute('width', '12');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
