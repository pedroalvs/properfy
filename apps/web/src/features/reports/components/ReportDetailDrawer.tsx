import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useReportDetail } from '../hooks/useReportDetail';
import { ReportStatusChip } from './ReportStatusChip';
import { ReportDetailSections } from './ReportDetailSections';
import { getReportFileName } from '../lib/report-display';

interface ReportDetailDrawerProps {
  reportId: string | null;
  open: boolean;
  onClose: () => void;
}

export function ReportDetailDrawer({ reportId, open, onClose }: ReportDetailDrawerProps) {
  const { report, isLoading } = useReportDetail(reportId);

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
              title={getReportFileName(report) ?? 'Report'}
              onClose={onClose}
              actions={<ReportStatusChip status={report.status} />}
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
