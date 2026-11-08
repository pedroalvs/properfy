import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { useIsOnline } from '@/hooks/useIsOnline';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { usePropertyFiles } from '../hooks/usePropertyFiles';
import { usePropertyIssues } from '../hooks/usePropertyIssues';
import { subtabCounts } from '../lib/property-file-view';
import { IssueList } from './IssueList';
import { FileList } from './FileList';
import { ReportIssueSheet } from './ReportIssueSheet';

type Subtab = 'issues' | 'documents' | 'reports' | 'other';

interface PropertyFilesSectionProps {
  appointmentId: string;
  propertyId: string;
  propertyAddress: string;
}

/**
 * Read-only Files section in the inspector service detail: Segmented subtabs
 * (Issues first, then Documents/Reports/Other) with per-type counts (C.9), plus
 * the "Report issue" action. Online-only — file/issue reads are never cached in
 * the service worker, so offline shows a "connect to load" state, never stale
 * data.
 */
export function PropertyFilesSection({ appointmentId, propertyId, propertyAddress }: PropertyFilesSectionProps) {
  const isOnline = useIsOnline();
  const filesQuery = usePropertyFiles(appointmentId);
  const issuesQuery = usePropertyIssues(appointmentId);
  const [tab, setTab] = useState<Subtab>('issues');
  const [reportOpen, setReportOpen] = useState(false);

  const counts = useMemo(
    () => subtabCounts(issuesQuery.issues, filesQuery.grouped),
    [issuesQuery.issues, filesQuery.grouped],
  );

  const options = useMemo(
    () => [
      { id: 'issues' as const, label: `Issues (${counts.issues})` },
      { id: 'documents' as const, label: `Documents (${counts.documents})` },
      { id: 'reports' as const, label: `Reports (${counts.reports})` },
      { id: 'other' as const, label: `Other (${counts.other})` },
    ],
    [counts],
  );

  function renderBody() {
    if (!isOnline) {
      return (
        <p className="py-6 text-center text-sm text-muted-foreground" data-testid="property-files-offline">
          You&apos;re offline. Connect to load files.
        </p>
      );
    }
    if (filesQuery.isLoading || issuesQuery.isLoading) {
      return <LoadingState rows={3} variant="card" />;
    }
    if (filesQuery.isError || issuesQuery.isError) {
      return (
        <ErrorState
          message="Failed to load files"
          onRetry={() => {
            void filesQuery.refetch();
            void issuesQuery.refetch();
          }}
        />
      );
    }
    switch (tab) {
      case 'issues':
        return <IssueList issues={issuesQuery.issues} onReportIssue={() => setReportOpen(true)} />;
      case 'documents':
        return <FileList files={filesQuery.grouped.documents} emptyLabel="No documents" />;
      case 'reports':
        return <FileList files={filesQuery.grouped.reports} emptyLabel="No reports" />;
      case 'other':
        return <FileList files={filesQuery.grouped.other} emptyLabel="No other files" />;
    }
  }

  return (
    <Card data-testid="property-files-section" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-bold text-foreground">Files ({counts.total})</h2>
      </div>

      <Segmented<Subtab> aria-label="File type" value={tab} onChange={setTab} options={options} />

      {renderBody()}

      <ReportIssueSheet
        open={reportOpen}
        onOpenChange={setReportOpen}
        appointmentId={appointmentId}
        propertyId={propertyId}
        propertyAddress={propertyAddress}
      />
    </Card>
  );
}
