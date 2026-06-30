import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockUsePlan = vi.fn();
vi.mock('../hooks/useGroupPortalLinkPlan', () => ({
  useGroupPortalLinkPlan: (groupId: string | null, enabled: boolean) => mockUsePlan(groupId, enabled),
}));

import { SendPortalLinkDialog } from './SendPortalLinkDialog';

function summary(overrides: Partial<{ total: number; willSend: number; willResendDateChanged: number; alreadyConfirmed: number; notSendable: number }> = {}) {
  return {
    plan: {
      items: [],
      summary: { total: 5, willSend: 3, willResendDateChanged: 1, alreadyConfirmed: 1, notSendable: 0, ...overrides },
    },
    isLoading: false,
    isError: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SendPortalLinkDialog', () => {
  it('renders the summary counts from the preview', () => {
    mockUsePlan.mockReturnValue(summary());
    render(
      <SendPortalLinkDialog open onClose={vi.fn()} serviceGroupId="sg-01" sending={false} onConfirm={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Send portal link' })).toBeInTheDocument();
    expect(screen.getByText(/will be sent/)).toBeInTheDocument();
    expect(screen.getByText(/will be re-sent \(date changed\)/)).toBeInTheDocument();
    expect(screen.getByText(/already confirmed/)).toBeInTheDocument();
  });

  it('fires onConfirm when the confirm button is clicked', () => {
    mockUsePlan.mockReturnValue(summary());
    const onConfirm = vi.fn();
    render(
      <SendPortalLinkDialog open onClose={vi.fn()} serviceGroupId="sg-01" sending={false} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send portal link' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('disables confirm while the preview is loading', () => {
    mockUsePlan.mockReturnValue({ plan: null, isLoading: true, isError: false });
    render(
      <SendPortalLinkDialog open onClose={vi.fn()} serviceGroupId="sg-01" sending={false} onConfirm={vi.fn()} />,
    );

    expect(screen.getByText('Loading appointments…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send portal link' })).toBeDisabled();
  });

  it('disables confirm when nothing would be sent', () => {
    mockUsePlan.mockReturnValue(summary({ willSend: 0, willResendDateChanged: 0, alreadyConfirmed: 5 }));
    render(
      <SendPortalLinkDialog open onClose={vi.fn()} serviceGroupId="sg-01" sending={false} onConfirm={vi.fn()} />,
    );

    expect(screen.getByText(/No appointments need a portal link/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send portal link' })).toBeDisabled();
  });

  it('only enables the preview query while open', () => {
    mockUsePlan.mockReturnValue(summary());
    render(
      <SendPortalLinkDialog open onClose={vi.fn()} serviceGroupId="sg-01" sending={false} onConfirm={vi.fn()} />,
    );
    expect(mockUsePlan).toHaveBeenCalledWith('sg-01', true);
  });
});
