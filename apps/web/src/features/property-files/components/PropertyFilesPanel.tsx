import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PropertyFileType } from '@properfy/shared';
import { TabsNav } from '@/components/layout/TabsNav';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { usePropertyAppointments } from '@/features/properties/hooks/usePropertyAppointments';
import { usePropertyFiles } from '../hooks/usePropertyFiles';
import { usePropertyIssues } from '../hooks/usePropertyIssues';
import { groupLatestVersions } from '../lib/file-versions';
import { SUBTAB_LABELS, isSubtab, type FileSubtab } from '../lib/file-type';
import { IssueSubtab } from './IssueSubtab';
import { FileSubtabList, type AppointmentRefs } from './FileSubtabList';

export type PanelContext =
  | { kind: 'appointment'; appointmentId: string; propertyId: string }
  | { kind: 'property'; propertyId: string };

export interface PropertyFilesPanelProps {
  context: PanelContext;
  initialSubtab?: FileSubtab;
}

const SUBTAB_TYPE: Record<Exclude<FileSubtab, 'issues'>, PropertyFileType> = {
  documents: PropertyFileType.DOCUMENT,
  reports: PropertyFileType.REPORT,
  other: PropertyFileType.OTHER,
};

export function PropertyFilesPanel({ context, initialSubtab }: PropertyFilesPanelProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canPerform } = usePermissions();
  const [subtab, setSubtab] = useState<FileSubtab>(initialSubtab ?? 'issues');

  const scope =
    context.kind === 'appointment'
      ? { appointmentId: context.appointmentId }
      : { propertyId: context.propertyId };

  const filesQuery = usePropertyFiles(scope);
  const issuesQuery = usePropertyIssues(scope);

  // Property context resolves appointment codes for linked items + the link selector.
  const appts = usePropertyAppointments(context.kind === 'property' ? context.propertyId : null);
  const appointmentRefs: AppointmentRefs | undefined = useMemo(() => {
    if (context.kind !== 'property') return undefined;
    return {
      codeMap: Object.fromEntries(appts.data.map((a) => [a.id, a.code])),
      options: appts.data.map((a) => ({ id: a.id, code: a.code })),
    };
  }, [context.kind, appts.data]);

  const byType = useMemo(() => {
    const documents = filesQuery.files.filter((f) => f.type === PropertyFileType.DOCUMENT);
    const reports = filesQuery.files.filter((f) => f.type === PropertyFileType.REPORT);
    const other = filesQuery.files.filter((f) => f.type === PropertyFileType.OTHER);
    return { documents, reports, other };
  }, [filesQuery.files]);

  const counts = useMemo(
    () => ({
      issues: issuesQuery.issues.length,
      documents: groupLatestVersions(byType.documents).length,
      reports: groupLatestVersions(byType.reports).length,
      other: groupLatestVersions(byType.other).length,
    }),
    [issuesQuery.issues, byType],
  );

  const canUpload = canPerform('property_file.upload');
  const canVersion = canPerform('property_file.version');
  const canDeleteFile = canPerform('property_file.delete');
  const canCreateIssue = canPerform('property_issue.create');
  const canMarkSeen = canPerform('property_issue.mark_seen');
  const canDeleteIssue = canPerform('property_issue.delete');

  const openAppointment =
    context.kind === 'property' ? (id: string) => navigate(`/appointments/${id}`) : undefined;

  const viewAllProperty = (sub: FileSubtab) =>
    navigate(`/properties/${context.propertyId}?tab=files&sub=${sub}`);

  if (filesQuery.isLoading || issuesQuery.isLoading) {
    return <LoadingState rows={4} variant="card" />;
  }
  if (filesQuery.isError || issuesQuery.isError) {
    return (
      <ErrorState
        message="Couldn't load files"
        onRetry={() => {
          filesQuery.refetch();
          issuesQuery.refetch();
        }}
      />
    );
  }

  const tabs = [
    { id: 'issues', label: SUBTAB_LABELS.issues, badge: counts.issues },
    { id: 'documents', label: SUBTAB_LABELS.documents, badge: counts.documents },
    { id: 'reports', label: SUBTAB_LABELS.reports, badge: counts.reports },
    { id: 'other', label: SUBTAB_LABELS.other, badge: counts.other },
  ];

  return (
    <div className="flex flex-col gap-4">
      <TabsNav tabs={tabs} activeTab={subtab} onChange={(id) => isSubtab(id) && setSubtab(id)} />

      {subtab === 'issues' ? (
        <IssueSubtab
          issues={issuesQuery.issues}
          propertyId={context.propertyId}
          appointmentId={context.kind === 'appointment' ? context.appointmentId : undefined}
          canCreate={canCreateIssue}
          canMarkSeen={canMarkSeen}
          canDelete={canDeleteIssue}
          currentUserId={user?.id ?? null}
          appointmentRefs={appointmentRefs}
          onOpenAppointment={openAppointment}
          onViewAllIssues={context.kind === 'appointment' ? () => viewAllProperty('issues') : undefined}
        />
      ) : (
        <FileSubtabList
          files={byType[subtab]}
          type={SUBTAB_TYPE[subtab]}
          propertyId={context.propertyId}
          appointmentId={context.kind === 'appointment' ? context.appointmentId : undefined}
          canUpload={canUpload}
          canVersion={canVersion}
          canDelete={canDeleteFile}
          appointmentRefs={appointmentRefs}
          onOpenAppointment={openAppointment}
        />
      )}

      {context.kind === 'appointment' && subtab !== 'issues' && (
        <div>
          <button
            type="button"
            onClick={() => viewAllProperty(subtab)}
            className="text-sm font-semibold text-primary hover:underline"
          >
            View all property files
          </button>
        </div>
      )}
    </div>
  );
}
