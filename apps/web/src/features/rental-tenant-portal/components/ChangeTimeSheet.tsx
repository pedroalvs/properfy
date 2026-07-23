import { useEffect, useId, useRef } from 'react';
import type { AvailableGroup } from '@properfy/shared';
import { AvailableGroupsList } from './AvailableGroupsList';

interface ChangeTimeSheetProps {
  open: boolean;
  onClose: () => void;
  groups: AvailableGroup[];
  isLoading?: boolean;
  isError?: boolean;
  selectedSlotKey?: string;
  onSelect: (group: AvailableGroup) => void;
  onRetry?: () => void;
  onJoin: () => void;
  isJoining?: boolean;
  joinErrorMessage?: string | null;
}

/**
 * "Pick a time for your booking" — bottom sheet on mobile, centered dialog on
 * larger screens. Hosts the available-slots picker and the join action.
 */
export function ChangeTimeSheet({
  open,
  onClose,
  groups,
  isLoading,
  isError,
  selectedSlotKey,
  onSelect,
  onRetry,
  onJoin,
  isJoining,
  joinErrorMessage,
}: ChangeTimeSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    sheetRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--color-secondary)_45%,transparent)]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        tabIndex={-1}
        className="relative z-10 flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white px-5 pb-6 pt-3 shadow-xl outline-none sm:max-w-[480px] sm:rounded-2xl sm:pt-5"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden" aria-hidden="true" />

        <div className="mb-3 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-bold text-secondary">
            Pick a time for your booking
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-full p-1 text-text-muted hover:bg-gray-100 hover:text-text-primary"
          >
            <i className="mdi mdi-close text-xl" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <AvailableGroupsList
            groups={groups}
            isLoading={isLoading}
            isError={isError}
            selectedSlotKey={selectedSlotKey}
            onSelect={onSelect}
            onRetry={onRetry}
          />
          {joinErrorMessage && (
            <p
              className="mt-3 rounded border border-[color-mix(in_srgb,var(--color-error)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-error)_10%,white)] px-3 py-2 text-sm text-error"
              role="alert"
            >
              {joinErrorMessage}
            </p>
          )}
        </div>

        {selectedSlotKey && (
          <button
            type="button"
            onClick={onJoin}
            disabled={isJoining}
            className="mt-4 w-full rounded-full bg-real-estate py-3 text-sm font-extrabold text-white transition-colors hover:bg-[color-mix(in_srgb,var(--color-real-estate)_85%,black)] disabled:opacity-60"
          >
            {isJoining ? 'Joining…' : 'Join this time slot'}
          </button>
        )}
      </div>
    </div>
  );
}
