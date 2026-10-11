import { type ReactNode } from 'react';
import { cn } from '@properfy/frontend-standards';
import { Button } from '@/components/ui/Button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/Sheet';

interface ConfirmationSheetProps {
  icon: string;
  iconClassName: string;
  title: string;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  testId: string;
  confirmTestId: string;
  cancelTestId: string;
}

/**
 * Accessible confirmation bottom-sheet. The dialog behaviour (focus trap, Escape to
 * close, scroll lock, portal, `role="dialog"` + `aria-modal`, focus restore) comes from
 * the shared Radix `Sheet`; Escape and overlay click both route to `onCancel`. The
 * parent mounts/unmounts this component, so `open` is hardcoded true and `onOpenChange`
 * only has to forward the close intent.
 */
export function ConfirmationSheet({
  icon,
  iconClassName,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  testId,
  confirmTestId,
  cancelTestId,
}: ConfirmationSheetProps) {
  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <SheetContent data-testid={testId} className="mx-auto max-w-lg">
        <div className="flex flex-col items-center gap-2 text-center">
          <i className={cn('mdi text-[40px]', icon, iconClassName)} aria-hidden="true" />
          <SheetTitle className="text-text-primary">{title}</SheetTitle>
          {description && (
            <SheetDescription className="text-text-secondary">{description}</SheetDescription>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={onConfirm}
            className="!w-full !min-h-touch"
            data-testid={confirmTestId}
            autoFocus
          >
            {confirmLabel}
          </Button>
          <Button
            variant="outlined"
            onClick={onCancel}
            className="!w-full !min-h-touch"
            data-testid={cancelTestId}
          >
            {cancelLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
