import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockUsePlan = vi.fn();
vi.mock('../hooks/useGroupPortalLinkPlan', () => ({
  useGroupPortalLinkPlan: (groupId: string | null, enabled: boolean) => mockUsePlan(groupId, enabled),
}));

import { SendPortalLinkDialog } from './SendPortalLinkDialog';

function summary(overrides: Partial<{ total: number; willSend: number; willResendDateChanged: number; alreadyConfirmed: number; notSendable: number; tenantNotificationsBlocked: number }> = {}) {
  return {
    plan: {
      items: [],
      summary: { total: 5, willSend: 3, willResendDateChanged: 1, alreadyConfirmed: 1, notSendable: 0, tenantNotificationsBlocked: 0, ...overrides },
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
    expect(screen.getByText(/eligible for a send attempt/i)).toBeInTheDocument();
    expect(screen.getByText(/eligible for another send attempt \(date changed\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/will be (?:re-)?sent/i)).not.toBeInTheDocument();
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

  it('disables confirm when nothing is eligible for an attempt', () => {
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

describe('SendPortalLinkDialog - agencies that do not notify tenants', () => {
  it('reports blocked members, since a group can span agencies', () => {
    mockUsePlan.mockReturnValue(summary({ total: 6, tenantNotificationsBlocked: 1 }));

    render(<SendPortalLinkDialog open onClose={vi.fn()} serviceGroupId="g-1" sending={false} onConfirm={vi.fn()} />);

    expect(screen.getByText(/blocked . agency does not notify tenants/i)).toBeInTheDocument();
  });

  it('omits the line when nothing is blocked', () => {
    mockUsePlan.mockReturnValue(summary());

    render(<SendPortalLinkDialog open onClose={vi.fn()} serviceGroupId="g-1" sending={false} onConfirm={vi.fn()} />);

    expect(screen.queryByText(/blocked . agency does not notify tenants/i)).not.toBeInTheDocument();
  });

  it('disables confirm when every member is blocked', () => {
    mockUsePlan.mockReturnValue(
      summary({ total: 2, willSend: 0, willResendDateChanged: 0, alreadyConfirmed: 0, tenantNotificationsBlocked: 2 }),
    );

    render(<SendPortalLinkDialog open onClose={vi.fn()} serviceGroupId="g-1" sending={false} onConfirm={vi.fn()} />);

    expect(screen.getByText('No appointments need a portal link right now.')).toBeInTheDocument();
  });
});
