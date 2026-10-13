import { useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Z_INDEX } from '@properfy/frontend-standards';
import { Sheet, SheetOverlay, SheetPortal, SheetTitle } from '@/components/ui/Sheet';
import { GroupDetailContent } from './GroupDetailContent';

interface Props {
  groupId: string | null;
  onClose: () => void;
  onAccept?: () => void;
  accepting?: boolean;
}

/**
 * Marketplace group detail as a Radix bottom-sheet (phone). The shared `Sheet` primitive supplies
 * the focus trap, Escape handling, scroll lock, portal and focus restore. The overlay is rendered
 * explicitly (rather than via `SheetContent`) so the `detail-backdrop` test id stays queryable on
 * the scrim. While `accepting`, dismissal (backdrop, Escape, close button) is inert so an in-flight
 * acceptance cannot be abandoned mid-request. The body + total/accept footer live in the shared
 * `GroupDetailContent`, which the tablet right-pane (`GroupDetailPane`) reuses.
 */
export function GroupDetailBottomSheet({ groupId, onClose, onAccept, accepting }: Props) {
  const isOpen = groupId !== null;
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(next) => {
        if (!next && !accepting) onClose();
      }}
    >
      <SheetPortal>
        <SheetOverlay data-testid="detail-backdrop" style={{ zIndex: Z_INDEX.overlay }} />
        <DialogPrimitive.Content
          ref={contentRef}
          tabIndex={-1}
          data-testid="group-detail-sheet"
          aria-describedby={undefined}
          style={{ zIndex: Z_INDEX.overlay }}
          className="fixed inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-card border-t border-border bg-card pb-safe-b shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
          onOpenAutoFocus={(event) => {
            // Match the previous behaviour: focus the sheet container itself, not the
            // first focusable control.
            event.preventDefault();
            contentRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (accepting) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (accepting) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (accepting) event.preventDefault();
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="h-1 w-10 rounded-full bg-border" aria-hidden="true" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-3">
            <SheetTitle className="text-base">Inspection details</SheetTitle>
            <button
              data-testid="detail-close"
              onClick={() => {
                if (!accepting) onClose();
              }}
              disabled={accepting}
              className="-mr-2 flex min-h-touch min-w-touch items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40"
              aria-label="Close"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <GroupDetailContent groupId={groupId} onAccept={onAccept} accepting={accepting} />
        </DialogPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}
