import { ADDRESS_NOT_VERIFIED_MESSAGES, type AddressNotVerifiedReason } from '@properfy/shared';
import { Button } from '@/components/ui/Button';

interface AddressNotVerifiedAlertProps {
  reason: AddressNotVerifiedReason;
  /** When provided, renders the "Set location manually" escape (V2 rural pin, property only). */
  onSetManual?: () => void;
}

/**
 * The on-save address-validation error block (V-1 §5.3, reused by V-3 for the
 * inspector base). An assertive alert (`role="alert"`) that names the reason, gives
 * the supporting guidance and — for the property forms — offers the manual-pin
 * escape. The copy is the single shared source (`ADDRESS_NOT_VERIFIED_MESSAGES`),
 * so every screen that validates an address on save matches.
 */
export function AddressNotVerifiedAlert({ reason, onSetManual }: AddressNotVerifiedAlertProps) {
  const message = ADDRESS_NOT_VERIFIED_MESSAGES[reason];
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded bg-error/10 px-4 py-3 text-sm text-error"
    >
      <div className="flex items-start gap-3">
        <i className="mdi mdi-alert-circle mt-0.5 text-lg" />
        <div>
          <p className="font-semibold">{message.field}</p>
          <p className="mt-0.5">{message.support}</p>
        </div>
      </div>
      {onSetManual && (
        <div className="flex items-center gap-2 pl-8">
          <span className="text-text-secondary">Can&apos;t locate this address?</span>
          <Button variant="outlined" onClick={onSetManual}>
            Set location manually
          </Button>
        </div>
      )}
    </div>
  );
}
