import { useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useReportDetail } from '../hooks/useReportDetail';
import { ReportStatusChip } from './ReportStatusChip';
import { ReportDetailSections } from './ReportDetailSections';

interface ReportDetailDrawerProps {
  reportId: string | null;
  open: boolean;
  onClose: () => void;
}

export function ReportDetailDrawer({ reportId, open, onClose }: ReportDetailDrawerProps) {
  const { report, isLoading } = useReportDetail(reportId);
  const { showInfo } = useSnackbar();

  const handleEdit = useCallback(() => {
    showInfo('Editing coming soon');
  }, [showInfo]);

  return (
    <DrawerPanel open={open} onClose={onClose} size="narrow">
      <div className="flex h-full flex-col">
        {isLoading ? (
          <>
            <DrawerHeader title="Loading..." onClose={onClose} />
            <div className="flex-1 px-6 py-4">
              <LoadingState rows={6} />
            </div>
          </>
        ) : report ? (
          <>
            <DrawerHeader
              title={report.fileName ?? 'Report'}
              onClose={onClose}
              actions={
                <>
                  <ReportStatusChip status={report.status} />
                  <Button variant="icon" onClick={handleEdit} aria-label="Edit">
                    <i className="mdi mdi-pencil-outline text-xl" />
                  </Button>
                </>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <ReportDetailSections report={report} />
            </div>
          </>
        ) : null}
      </div>
    </DrawerPanel>
  );
}
