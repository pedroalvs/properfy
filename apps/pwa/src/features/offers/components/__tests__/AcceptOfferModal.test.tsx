import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcceptOfferModal } from '../AcceptOfferModal';
import type { MarketplaceOffer } from '../../types';

const offer: MarketplaceOffer = {
  groupId: '00000000-0000-0000-0000-000000000009',
  groupNumber: 2051,
  code: '2051',
  tenantName: 'Properfy Realty',
  serviceTypeName: 'Routine Inspection',
  groupSize: 3,
  scheduledDate: '2026-08-14',
  timeWindow: '09:00-13:00',
  priorityMode: 'STANDARD',
  priorityExpiresAt: null,
  suburbs: ['Harris Park'],
  payoutEstimate: 240,
  appointmentCount: 3,
  centroid: null,
};

describe('AcceptOfferModal', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    onCancel.mockClear();
  });

  it('stays hidden outside the confirming and accepting states', () => {
    render(<AcceptOfferModal offer={offer} state="IDLE" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.queryByTestId('accept-modal')).not.toBeInTheDocument();
  });

  it('confirms the acceptance', async () => {
    const user = userEvent.setup();
    render(<AcceptOfferModal offer={offer} state="CONFIRMING" onConfirm={onConfirm} onCancel={onCancel} />);
    await user.click(screen.getByTestId('modal-confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('keeps its actions clear of the iOS home indicator', () => {
    // The overlay is `items-end`, so the sheet is flush with the bottom edge. Unlike the
    // execution sheets the padding lives on an inner wrapper, so the inset goes on the
    // sheet container where nothing else sets padding-bottom.
    render(<AcceptOfferModal offer={offer} state="CONFIRMING" onConfirm={onConfirm} onCancel={onCancel} />);
    const sheet = screen.getByTestId('accept-modal').firstElementChild!;
    expect(sheet.className).toContain('pb-safe-b');
  });
});
