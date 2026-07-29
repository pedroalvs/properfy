interface AppointmentBulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkEdit: () => void;
  /** Omit the re-send action entirely when the actor lacks the permission. */
  canBulkResend?: boolean;
  onBulkResend?: () => void;
  resendPending?: boolean;
}

/**
 * Fixed bottom bar shown while appointments are selected. Shared by the list and
 * the board so the two screens cannot drift in offset, styling or wording.
 * `left-[75px]` clears the fixed sidebar.
 */
export function AppointmentBulkActionBar({
  selectedCount,
  onClearSelection,
  onBulkEdit,
  canBulkResend = false,
  onBulkResend,
  resendPending = false,
}: AppointmentBulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-[75px] right-0 z-40 flex items-center justify-between border-t border-border-subtle bg-card-bg px-6 py-3 shadow-lg">
      <span className="text-sm font-medium text-text-primary">
        {selectedCount} appointment{selectedCount !== 1 ? 's' : ''} selected
      </span>
      <div className="flex items-center gap-3">
        <button
          onClick={onClearSelection}
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          Clear selection
        </button>
        {canBulkResend && onBulkResend ? (
          <button
            onClick={onBulkResend}
            disabled={resendPending}
            className="inline-flex h-9 items-center gap-2 rounded border border-real-estate px-4 text-sm font-semibold text-real-estate hover:bg-real-estate/10 disabled:opacity-60"
          >
            <i className="mdi mdi-email-send-outline text-base" />
            Re-send reminder ({selectedCount})
          </button>
        ) : null}
        <button
          onClick={onBulkEdit}
          className="inline-flex h-9 items-center gap-2 rounded bg-real-estate px-4 text-sm font-semibold text-white hover:brightness-95 active:brightness-90"
        >
          <i className="mdi mdi-pencil-outline text-base" />
          Bulk Edit ({selectedCount})
        </button>
      </div>
    </div>
  );
}
