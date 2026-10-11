import { useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/Sheet';
import { formatCivilDate, formatWallTimeWindow } from '@/lib/format-date';
import { formatCurrency } from '@/lib/format-currency';
import type { MarketplaceOffer, OfferAcceptState } from '../types';

interface AcceptOfferModalProps {
  offer: MarketplaceOffer;
  state: OfferAcceptState;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AcceptOfferModal({ offer, state, onConfirm, onCancel }: AcceptOfferModalProps) {
  const isOpen = state === 'CONFIRMING' || state === 'ACCEPTING';
  const isAccepting = state === 'ACCEPTING';
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(next) => {
        // While ACCEPTING the request is in flight — dismissal is inert (parity with the
        // disabled Cancel button). Only cancel from CONFIRMING.
        if (!next && state === 'CONFIRMING') onCancel();
      }}
    >
      <SheetContent
        data-testid="accept-modal"
        className="z-[100] mx-auto max-w-lg px-6"
        onOpenAutoFocus={(event) => {
          // Focus the primary action rather than the first focusable (Cancel).
          event.preventDefault();
          confirmRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (isAccepting) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isAccepting) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isAccepting) event.preventDefault();
        }}
      >
        <SheetTitle className="text-foreground">Confirm acceptance</SheetTitle>
        <SheetDescription className="mt-0.5">
          Once accepted, these inspections are assigned to you.
        </SheetDescription>

        {/* Summary details */}
        <div className="mt-4 space-y-2.5 text-sm">
          <Row label="Service" value={offer.serviceTypeName} />
          <Row label="Agency" value={offer.tenantName} />
          <Row label="Date" value={formatCivilDate(offer.scheduledDate)} />
          <Row label="Time window" value={formatWallTimeWindow(offer.timeWindow)} />
          <Row
            label="Inspections"
            value={`${offer.appointmentCount} ${offer.appointmentCount === 1 ? 'inspection' : 'inspections'}`}
          />
          {offer.suburbs.length > 0 && <Row label="Area" value={offer.suburbs.join(', ')} />}
        </div>

        {/* Payout highlight */}
        {offer.payoutEstimate != null && (
          <div className="mt-4 rounded-xl bg-success/10 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-success">Estimated payout</span>
            <span className="text-xl font-bold text-success" data-testid="modal-payout">
              {formatCurrency(offer.payoutEstimate)}
            </span>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isAccepting}
            className="flex-1"
            data-testid="modal-cancel"
          >
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            variant="primary"
            onClick={onConfirm}
            loading={isAccepting}
            className="flex-1 font-bold"
            data-testid="modal-confirm"
          >
            Accept
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-semibold text-foreground text-right">{value}</span>
    </div>
  );
}
