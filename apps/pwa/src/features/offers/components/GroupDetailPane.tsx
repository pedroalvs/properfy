import { X } from 'lucide-react';
import { GroupDetailContent } from './GroupDetailContent';

interface Props {
  groupId: string;
  onClose: () => void;
  onAccept?: () => void;
  accepting?: boolean;
}

/**
 * Tablet counterpart of `GroupDetailBottomSheet`: the marketplace group detail rendered inline in
 * the right pane of the 2-column layout (no overlay / focus-trap, since the master list stays
 * visible beside it). Shares the body + total/accept footer via `GroupDetailContent`.
 */
export function GroupDetailPane({ groupId, onClose, onAccept, accepting }: Props) {
  return (
    <div className="flex flex-col bg-card" data-testid="group-detail-pane">
      <div className="flex items-center justify-between px-5 pb-3 pt-4">
        <h2 className="text-base font-bold text-foreground">Inspection details</h2>
        <button
          data-testid="detail-pane-close"
          onClick={() => {
            if (!accepting) onClose();
          }}
          disabled={accepting}
          className="-mr-2 flex min-h-touch min-w-touch items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40"
          aria-label="Close details"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <GroupDetailContent groupId={groupId} onAccept={onAccept} accepting={accepting} />
    </div>
  );
}
