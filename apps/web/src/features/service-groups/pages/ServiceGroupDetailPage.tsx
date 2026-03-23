import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { useCancelServiceGroup } from '../hooks/useCancelServiceGroup';
import { ServiceGroupStatusChip } from '../components/ServiceGroupStatusChip';
import { ServiceGroupDetailSections } from '../components/ServiceGroupDetailSections';
import { ManualAssignModal } from '../components/ManualAssignModal';
import { CancelGroupModal } from '../components/CancelGroupModal';

export function ServiceGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { serviceGroup, isLoading, isError, refetch } = useServiceGroupDetail(id ?? null);
  const { publish, isPublishing } = usePublishServiceGroup(id ?? null, refetch);
  const { assign } = useAssignInspector(id ?? null, refetch);
  const { cancel } = useCancelServiceGroup(id ?? null, refetch);

  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const handleAssign = useCallback(
    (inspectorId: string) => {
      assign(inspectorId);
      setAssignOpen(false);
    },
    [assign],
  );

  const handleCancel = useCallback(
    (reason: string) => {
      cancel(reason);
      setCancelOpen(false);
    },
    [cancel],
  );

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Loading..."
          secondaryActions={[
            { label: 'Back', icon: 'mdi-arrow-left', onClick: () => navigate(-1) },
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
            { label: 'Back', icon: 'mdi-arrow-left', onClick: () => navigate(-1) },
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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded p-1 text-text-secondary hover:bg-black/5"
            aria-label="Go back"
          >
            <i className="mdi mdi-arrow-left text-xl" aria-hidden="true" />
          </button>
          <h1 className="text-page-title-mobile text-secondary md:text-page-title">
            {serviceGroup.name}
          </h1>
          <ServiceGroupStatusChip status={serviceGroup.status} />
        </div>
      </div>

      <div className="rounded bg-card-bg p-6 shadow-sm">
        <ServiceGroupDetailSections serviceGroup={serviceGroup} />

        {/* Inspector panel for accepted groups */}
        {isAccepted && serviceGroup.inspectorName && (
          <div className="mt-6">
            <FormSection title="Assigned Inspector">
              <DetailRow label="Inspector" value={serviceGroup.inspectorName} />
            </FormSection>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!isCancelled && (
        <div className="mt-4 flex flex-wrap gap-3">
          {isDraft && (
            <Button
              variant="primary"
              loading={isPublishing}
              onClick={publish}
            >
              <i className="mdi mdi-publish text-base" aria-hidden="true" />
              Publish
            </Button>
          )}
          {isPublished && (
            <Button
              variant="outlined"
              onClick={() => setAssignOpen(true)}
            >
              <i className="mdi mdi-account-arrow-right text-base" aria-hidden="true" />
              Manual Assign
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
        </div>
      )}

      <ManualAssignModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        onAssign={handleAssign}
        serviceGroupId={id ?? ''}
      />
      <CancelGroupModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onCancel={handleCancel}
        serviceGroupId={id ?? ''}
      />
    </div>
  );
}
