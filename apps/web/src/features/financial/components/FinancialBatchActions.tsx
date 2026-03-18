import { Button } from '@/components/ui/Button';
import { useFinancialBatchApprove } from '../hooks/useFinancialBatchApprove';

interface FinancialBatchActionsProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onApproveComplete: (result: { success: boolean; failedCount: number }) => void;
}

export function FinancialBatchActions({
  selectedIds,
  onClearSelection,
  onApproveComplete,
}: FinancialBatchActionsProps) {
  const { approve, isApproving } = useFinancialBatchApprove();

  if (selectedIds.length === 0) return null;

  const handleApprove = async () => {
    const result = await approve(selectedIds);
    onApproveComplete(result);
    if (result.success) {
      onClearSelection();
    }
  };

  return (
    <div
      className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-secondary px-6 py-3 shadow-lg"
      data-testid="batch-actions-bar"
    >
      <span className="text-sm font-semibold text-white">
        {selectedIds.length} {selectedIds.length === 1 ? 'entry' : 'entries'} selected
      </span>
      <Button variant="primary" loading={isApproving} onClick={handleApprove}>
        Approve Selected
      </Button>
      <Button variant="secondary" onClick={onClearSelection} disabled={isApproving}>
        Clear
      </Button>
    </div>
  );
}
