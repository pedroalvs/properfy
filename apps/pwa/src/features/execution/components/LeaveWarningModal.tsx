import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/Dialog';

interface LeaveWarningModalProps {
  onStay: () => void;
  onLeave: () => void;
}

/**
 * Forces an explicit Stay/Leave choice while an inspection is in progress. Built on the
 * shared Radix `Dialog` as an `alertdialog`: no Escape dismiss and no outside-click
 * dismiss (both are prevented), no close affordance (`hideClose`), and focus lands on the
 * Stay button. The parent (`ExecutionPage`) mounts this only while the navigation blocker
 * is active, so `open` is hardcoded true with no `onOpenChange` — it can only resolve
 * through Stay or Leave.
 */
export function LeaveWarningModal({ onStay, onLeave }: LeaveWarningModalProps) {
  return (
    <Dialog open>
      <DialogContent
        role="alertdialog"
        hideClose
        data-testid="leave-warning-modal"
        className="pb-safe-b-6"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <AlertCircle size={40} className="text-warning" aria-hidden="true" />
          <DialogTitle>Leave inspection?</DialogTitle>
          <DialogDescription>
            You have an inspection in progress. Your data is saved locally and you can resume later.
          </DialogDescription>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={onStay}
            className="!w-full !min-h-touch"
            data-testid="stay-button"
            autoFocus
          >
            Stay
          </Button>
          <Button
            variant="outlined"
            onClick={onLeave}
            className="!w-full !min-h-touch !text-destructive !border-destructive"
            data-testid="leave-button"
          >
            Leave anyway
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
