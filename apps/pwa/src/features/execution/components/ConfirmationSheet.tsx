import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

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

/** Accessible confirmation bottom-sheet (dialog semantics + focus lifecycle + Escape). */
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
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancelRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" data-testid={testId}>
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-t-2xl bg-card-bg p-6 outline-none"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <i className={`mdi ${icon} text-[40px] ${iconClassName}`} aria-hidden="true" />
          <h2 id={titleId} className="text-lg font-bold text-text-primary">
            {title}
          </h2>
          {description && <p className="text-sm text-text-secondary">{description}</p>}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={onConfirm}
            className="!w-full !min-h-touch"
            data-testid={confirmTestId}
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
      </div>
    </div>
  );
}
