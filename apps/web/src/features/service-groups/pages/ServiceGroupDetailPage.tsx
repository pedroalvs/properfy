import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Button } from '@/components/ui/Button';
import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { ServiceGroupStatus } from '@properfy/shared';
import { useServiceGroupDetail } from '../hooks/useServiceGroupDetail';
import { usePublishServiceGroup } from '../hooks/usePublishServiceGroup';
import { useAssignInspector } from '../hooks/useAssignInspector';
import { useReassignInspector } from '../hooks/useReassignInspector';
import { useCancelServiceGroup } from '../hooks/useCancelServiceGroup';
import { useRejectServiceGroup } from '../hooks/useRejectServiceGroup';
import { useRepublishServiceGroup } from '../hooks/useRepublishServiceGroup';
import { useUnpublishServiceGroup } from '../hooks/useUnpublishServiceGroup';
import { useSendGroupPortalLinks } from '../hooks/useSendGroupPortalLinks';
import { ServiceGroupStatusChip } from '../components/ServiceGroupStatusChip';
import { ServiceGroupDetailSections } from '../components/ServiceGroupDetailSections';
import { ManualAssignModal } from '../components/ManualAssignModal';
import { ServiceGroupActionsMenu } from '../components/ServiceGroupActionsMenu';
import { RescheduleGroupModal } from '../components/RescheduleGroupModal';
import { CancelGroupModal } from '../components/CancelGroupModal';
import { RejectGroupModal } from '../components/RejectGroupModal';
import { RepublishGroupModal } from '../components/RepublishGroupModal';
import { UnpublishGroupModal } from '../components/UnpublishGroupModal';
import { EditGroupModal } from '../components/EditGroupModal';
import { SendPortalLinkDialog } from '../components/SendPortalLinkDialog';
import { useGoBack } from '@/hooks/useGoBack';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { getPublishBlockReason } from '../lib/publish-block-reason';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';

const PUBLISH_BLOCK_REASON_ID = 'publish-block-reason';

export function ServiceGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const effectiveTimezone = useEffectiveTimezone();
  const handleBack = useGoBack('/service-groups');
  const { serviceGroup, isLoading, isError, refetch } = useServiceGroupDetail(id ?? null);
  const { publish, isPublishing } = usePublishServiceGroup(id ?? null, refetch);
  const { assign, isAssigning } = useAssignInspector(id ?? null, refetch);
  const { reassign, isReassigning } = useReassignInspector(id ?? null, refetch);
  const [rescheduleMode, setRescheduleMode] = useState<'date' | 'time-window' | null>(null);
  const { cancel } = useCancelServiceGroup(id ?? null, refetch);
  const { reject } = useRejectServiceGroup(id ?? null, refetch);
  const { republish } = useRepublishServiceGroup(id ?? null, refetch);
  const { unpublish, isUnpublishing } = useUnpublishServiceGroup(id ?? null, refetch);
  const { send: sendPortalLinks, isSending: isSendingPortalLinks } = useSendGroupPortalLinks(
    id ?? null,
    refetch,
  );

  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [republishOpen, setRepublishOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [portalLinkOpen, setPortalLinkOpen] = useState(false);

  const handleSendPortalLinks = useCallback(() => {
    sendPortalLinks();
    setPortalLinkOpen(false);
  }, [sendPortalLinks]);

  const handleAssign = useCallback(
    (inspectorId: string, reason: string) => {
      // An accepted group already has an inspector, and /assign answers that
      // with a 409 by design — replacement is its own endpoint.
      if (serviceGroup?.status === ServiceGroupStatus.ACCEPTED) reassign(inspectorId, reason);
      else assign(inspectorId);
      setAssignOpen(false);
    },
    [assign, reassign, serviceGroup?.status],
  );

  const handleCancel = useCallback(
    (reason: string) => {
      cancel(reason);
      setCancelOpen(false);
    },
    [cancel],
  );

  const handleReject = useCallback(
    (reason: string) => {
      reject(reason);
      setRejectOpen(false);
    },
    [reject],
  );

  const handleRepublish = useCallback(
    (reason?: string) => {
      republish(reason);
      setRepublishOpen(false);
    },
    [republish],
  );

  const handleUnpublish = useCallback(
    (reason: string) => {
      unpublish(reason);
      setUnpublishOpen(false);
    },
    [unpublish],
  );

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Loading..."
          secondaryActions={[
            { label: 'Back', icon: 'mdi-arrow-left', onClick: handleBack },
          ]}
        />
        <div className="rounded bg-card-bg p-6 shadow-sm">
          <LoadingState rows={8} />
        </div>
      </div>
    );
  }

  if (isError || !serviceGroup) {
    return (
      <div>
        <PageHeader
          title="Service Group"
          secondaryActions={[
            { label: 'Back', icon: 'mdi-arrow-left', onClick: handleBack },
          ]}
        />
        <div className="rounded bg-card-bg p-6 shadow-sm">
          <ErrorState
            message="Failed to load service group details"
            onRetry={refetch}
          />
        </div>
      </div>
    );
  }

  const isDraft = serviceGroup.status === ServiceGroupStatus.DRAFT;
  const isPublished = serviceGroup.status === ServiceGroupStatus.PUBLISHED;
  const isAccepted = serviceGroup.status === ServiceGroupStatus.ACCEPTED;
  const isCancelled = serviceGroup.status === ServiceGroupStatus.CANCELLED;
  const canCancel = isDraft || isPublished || isAccepted;
  const canReject = isPublished || isAccepted;
  const canEdit = !isAccepted;
  // Plan edits (inspector, date, time window) are allowed on any live group;
  // a closed one has no schedule left to move and nobody to hand it to.
  const canChangePlan = isDraft || isPublished || isAccepted;
  // Portal links can only go to AWAITING_INSPECTOR/SCHEDULED appointments, which
  // exist only in non-terminal groups. Hidden for CANCELLED/REJECTED groups.
  const canSendPortalLinks = isDraft || isPublished || isAccepted;

  // Publishing releases the group to the marketplace, so it requires a
  // non-empty group, a schedule that has not passed and every appointment in
  // AWAITING_INSPECTOR. Mirrors the backend guards (which stay authoritative)
  // so the user reads the reason instead of hitting a 422.
  // `appointmentsCount` (server-derived, already falling back to the array
  // length in the hook) is the count of record — an absent `appointments`
  // array means "not in the payload", not "empty group".
  const publishBlockReason = getPublishBlockReason({
    status: serviceGroup.status,
    timeZone: effectiveTimezone,
    appointmentCount: serviceGroup.appointmentsCount,
    scheduledDate: serviceGroup.scheduledDate,
    timeWindow: serviceGroup.timeWindow,
    blockingAppointments: (serviceGroup.appointments ?? [])
      .filter((a) => a.status !== 'AWAITING_INSPECTOR')
      .map((a) => ({ label: `#${a.appointmentNumber}`, status: a.status })),
  });
  const publishBlocked = publishBlockReason !== null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="rounded p-1 text-text-secondary hover:bg-black/5"
            aria-label="Go back"
          >
            <i className="mdi mdi-arrow-left text-xl" aria-hidden="true" />
          </button>
          <h1 className="text-page-title-mobile text-secondary md:text-page-title">
            {serviceGroup.code ? `Group ${serviceGroup.code}` : '—'}
          </h1>
          <ServiceGroupStatusChip status={serviceGroup.status} />
        </div>
        {canEdit && (
          <button
            onClick={() => setEditOpen(true)}
            className="rounded p-2 text-text-secondary hover:bg-black/5"
            aria-label="Edit service group"
          >
            <i className="mdi mdi-pencil-outline text-xl" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="rounded bg-card-bg p-6 shadow-sm">
        <ServiceGroupDetailSections serviceGroup={serviceGroup} />

        {isAccepted && serviceGroup.inspectorName && (
          <div className="mt-6">
            <FormSection title="Assigned Inspector">
              <DetailRow label="Inspector" value={serviceGroup.inspectorName} />
            </FormSection>
          </div>
        )}
      </div>

      {/* Why Publish is unavailable, as visible text rather than a tooltip:
          a disabled button must not communicate its state by appearance alone. */}
      {isDraft && publishBlockReason && (
        <InfoBanner variant="warning" className="mt-4">
          <span id={PUBLISH_BLOCK_REASON_ID}>{publishBlockReason}</span>
        </InfoBanner>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap gap-3">
        {isDraft && (
          <Button
            variant="primary"
            loading={isPublishing}
            disabled={publishBlocked}
            onClick={publish}
            aria-describedby={publishBlocked ? PUBLISH_BLOCK_REASON_ID : undefined}
          >
            <i className="mdi mdi-publish text-base" aria-hidden="true" />
            Publish
          </Button>
        )}
        {isPublished && (
          <Button
            variant="secondary"
            loading={isUnpublishing}
            onClick={() => setUnpublishOpen(true)}
          >
            <i className="mdi mdi-publish-off text-base" aria-hidden="true" />
            Unpublish
          </Button>
        )}
        {canChangePlan && (
          <ServiceGroupActionsMenu
            isReplacement={isAccepted}
            onChangeInspector={() => setAssignOpen(true)}
            onChangeDate={() => setRescheduleMode('date')}
            onChangeTimeWindow={() => setRescheduleMode('time-window')}
          />
        )}
        {canReject && (
          <Button
            variant="secondary"
            onClick={() => setRejectOpen(true)}
            className="!text-error"
          >
            <i className="mdi mdi-close-circle text-base" aria-hidden="true" />
            Reject Group
          </Button>
        )}
        {canCancel && (
          <Button
            variant="secondary"
            onClick={() => setCancelOpen(true)}
            className="!text-error"
          >
            <i className="mdi mdi-cancel text-base" aria-hidden="true" />
            Cancel Group
          </Button>
        )}
        {isCancelled && (
          <Button
            variant="primary"
            onClick={() => setRepublishOpen(true)}
          >
            <i className="mdi mdi-refresh text-base" aria-hidden="true" />
            Republish
          </Button>
        )}
        {canSendPortalLinks && (
          <Button
            variant="outlined"
            loading={isSendingPortalLinks}
            onClick={() => setPortalLinkOpen(true)}
          >
            <i className="mdi mdi-email-fast-outline text-base" aria-hidden="true" />
            Send portal link
          </Button>
        )}
      </div>

      <ManualAssignModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        onAssign={handleAssign}
        serviceGroupId={id ?? ''}
        currentInspector={
          isAccepted && serviceGroup.inspectorId
            ? { id: serviceGroup.inspectorId, name: serviceGroup.inspectorName ?? 'Unknown' }
            : null
        }
        isReplacement={isAccepted}
        // Without this the confirm button stays live while the request is in
        // flight and a second click fires a duplicate assignment.
        loading={isAssigning || isReassigning}
      />
      {/* Mounted on demand so each open starts from the group's current schedule. */}
      {rescheduleMode && (
        <RescheduleGroupModal
          open
          mode={rescheduleMode}
          onClose={() => setRescheduleMode(null)}
          serviceGroup={serviceGroup}
          onSaved={refetch}
        />
      )}
      <CancelGroupModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onCancel={handleCancel}
        serviceGroupId={id ?? ''}
      />
      <RejectGroupModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onReject={handleReject}
        serviceGroupId={id ?? ''}
      />
      <UnpublishGroupModal
        open={unpublishOpen}
        onClose={() => setUnpublishOpen(false)}
        onUnpublish={handleUnpublish}
        loading={isUnpublishing}
      />

      <RepublishGroupModal
        open={republishOpen}
        onClose={() => setRepublishOpen(false)}
        onRepublish={handleRepublish}
        serviceGroupId={id ?? ''}
      />
      <SendPortalLinkDialog
        open={portalLinkOpen}
        onClose={() => setPortalLinkOpen(false)}
        serviceGroupId={id ?? ''}
        sending={isSendingPortalLinks}
        onConfirm={handleSendPortalLinks}
      />
      <EditGroupModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        serviceGroup={serviceGroup}
        onSaved={refetch}
      />
    </div>
  );
}
