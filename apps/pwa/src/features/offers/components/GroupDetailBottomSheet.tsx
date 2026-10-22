import { useEffect, useRef } from 'react';
import { GroupDetailContent } from './GroupDetailContent';

interface Props {
  groupId: string | null;
  onClose: () => void;
  onAccept?: () => void;
  accepting?: boolean;
}

export function GroupDetailBottomSheet({ groupId, onClose, onAccept, accepting }: Props) {
  const isOpen = groupId !== null;
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const acceptingRef = useRef(accepting);
  acceptingRef.current = accepting;

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !acceptingRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDismiss = () => {
    if (!accepting) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50"
      data-testid="detail-backdrop"
      onClick={handleDismiss}
    >
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white pb-safe-b shadow-2xl outline-none"
        data-testid="group-detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-black/10" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 id="group-detail-title" className="text-base font-bold text-secondary">Inspection details</h2>
          <button
            data-testid="detail-close"
            onClick={handleDismiss}
            disabled={accepting}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-gray-100 disabled:opacity-40"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <GroupDetailContent groupId={groupId} onAccept={onAccept} accepting={accepting} />
      </div>
    </div>
  );
}
