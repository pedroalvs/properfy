import { useMemo, useState } from 'react';
import type { PropertyIssueResponse } from '@properfy/shared';
import { FilterInput } from '@/components/filters/FilterInput';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button, ConfirmDialog } from '@/components/ui';
import { useMarkIssueSeen } from '../hooks/useMarkIssueSeen';
import { useDeletePropertyIssue } from '../hooks/useDeletePropertyIssue';
import { useDownloadPropertyFile } from '../hooks/useDownloadPropertyFile';
import { PropertyIssueCard } from './PropertyIssueCard';
import { CreateIssueDrawer } from './CreateIssueDrawer';
import type { AppointmentRefs } from './FileSubtabList';

export interface IssueSubtabProps {
  issues: PropertyIssueResponse[];
  propertyId: string;
  appointmentId?: string;
  canCreate: boolean;
  canMarkSeen: boolean;
  canDelete: boolean;
  currentUserId: string | null;
  appointmentRefs?: AppointmentRefs;
  onOpenAppointment?: (appointmentId: string) => void;
  /** Appointment context: jump to the property's full issue list. */
  onViewAllIssues?: () => void;
}

export function IssueSubtab({
  issues,
  propertyId,
  appointmentId,
  canCreate,
  canMarkSeen,
  canDelete,
  currentUserId,
  appointmentRefs,
  onOpenAppointment,
  onViewAllIssues,
}: IssueSubtabProps) {
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PropertyIssueResponse | null>(null);

  const { markSeen, markingId } = useMarkIssueSeen();
  const { remove, deletingId } = useDeletePropertyIssue();
  const { download, downloadingId } = useDownloadPropertyFile();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? issues.filter((i) => i.reason.toLowerCase().includes(term)) : issues;
  }, [issues, search]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="sm:max-w-xs sm:flex-1">
          <FilterInput label="Search issues" placeholder="Search by reason" value={search} onChange={setSearch} />
        </div>
        <div className="flex items-end gap-2">
          {onViewAllIssues && (
            <Button variant="secondary" onClick={onViewAllIssues}>
              View all property issues
            </Button>
          )}
          {canCreate && (
            <Button variant="primary" onClick={() => setDrawerOpen(true)}>
              <i className="mdi mdi-plus mr-1" aria-hidden="true" />
              Report issue
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No issues match your search' : 'No issues'}
          description={search ? undefined : 'Reported issues will appear here.'}
          icon="mdi-check-circle-outline"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((issue) => (
            <PropertyIssueCard
              key={issue.id}
              issue={issue}
              currentUserId={currentUserId}
              appointmentCode={
                issue.appointmentId ? appointmentRefs?.codeMap[issue.appointmentId] ?? null : null
              }
              onOpenAppointment={onOpenAppointment}
              onOpenPhoto={download}
              openingPhotoId={downloadingId}
              onMarkSeen={canMarkSeen && !issue.seenAt ? () => markSeen(issue.id) : undefined}
              markingSeen={markingId === issue.id}
              onDelete={canDelete && deletingId !== issue.id ? () => setDeleteTarget(issue) : undefined}
            />
          ))}
        </div>
      )}

      <CreateIssueDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        propertyId={propertyId}
        appointmentId={appointmentId}
        appointmentRefs={appointmentRefs}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) remove(deleteTarget.id);
          setDeleteTarget(null);
        }}
        title="Delete issue"
        message="Delete this issue and its photos? This can't be undone from the UI."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
