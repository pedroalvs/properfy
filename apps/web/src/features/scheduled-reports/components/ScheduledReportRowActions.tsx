import { useState, useCallback } from 'react';
import { RowActions } from '@/components/data/RowActions';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useScheduledReportMutations } from '../hooks/useScheduledReportMutations';
import type { ScheduledReport } from '../types';

interface ScheduledReportRowActionsProps {
  report: ScheduledReport;
  onEdit: () => void;
  onViewRuns: () => void;
  onMutated: () => void;
}

/**
 * Feature 019 T091: row action menu for the schedule table.
 * Edit opens the form drawer (passed via onEdit callback).
 * Pause / Resume / Delete are handled inline via mutations.
 */
export function ScheduledReportRowActions({
  report,
  onEdit,
  onViewRuns,
  onMutated,
}: ScheduledReportRowActionsProps) {
  const { pauseScheduledReport, resumeScheduledReport, deleteScheduledReport, isMutating } =
    useScheduledReportMutations();
  const { showSuccess, showError } = useSnackbar();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handlePause = useCallback(async () => {
    const result = await pauseScheduledReport(report.id);
    if (result.success) {
      showSuccess('Schedule paused');
      onMutated();
    } else {
      showError(result.error ?? 'Failed to pause');
    }
  }, [pauseScheduledReport, report.id, showSuccess, showError, onMutated]);

  const handleResume = useCallback(async () => {
    const result = await resumeScheduledReport(report.id);
    if (result.success) {
      showSuccess('Schedule resumed');
      onMutated();
    } else {
      showError(result.error ?? 'Failed to resume');
    }
  }, [resumeScheduledReport, report.id, showSuccess, showError, onMutated]);

  const handleDelete = useCallback(async () => {
    const result = await deleteScheduledReport(report.id);
    setShowDeleteConfirm(false);
    if (result.success) {
      showSuccess('Schedule deleted');
      onMutated();
    } else {
      showError(result.error ?? 'Failed to delete');
    }
  }, [deleteScheduledReport, report.id, showSuccess, showError, onMutated]);

  return (
    <>
      <RowActions
        actions={[
          {
            icon: 'mdi-history',
            label: 'View run history',
            onClick: onViewRuns,
          },
          {
            icon: 'mdi-pencil-outline',
            label: 'Edit',
            onClick: onEdit,
            disabled: isMutating,
          },
          ...(report.status === 'ACTIVE'
            ? [
                {
                  icon: 'mdi-pause-circle-outline',
                  label: 'Pause',
                  onClick: handlePause,
                  disabled: isMutating,
                },
              ]
            : [
                {
                  icon: 'mdi-play-circle-outline',
                  label: 'Resume',
                  onClick: handleResume,
                  disabled: isMutating,
                },
              ]),
          {
            icon: 'mdi-delete-outline',
            label: 'Delete',
            onClick: () => setShowDeleteConfirm(true),
            variant: 'delete' as const,
            disabled: isMutating,
          },
        ]}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete schedule?"
        message="This will soft-delete the schedule. No future runs will occur, but existing reports remain accessible."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}
