import { useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { GeocodingStatus } from '@properfy/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { BackButton } from '@/components/layout';
import { TabsNav } from '@/components/layout/TabsNav';
import { LoadingState } from '@/components/feedback/LoadingState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { Button } from '@/components/ui/Button';
import { MapboxPreview } from '@/components/map/MapboxPreview';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useActionMutation } from '@/hooks/useApiQuery';
import { usePropertyDetail } from '../hooks/usePropertyDetail';
import { PropertyTypeChip } from '../components/PropertyTypeChip';
import { PropertyDetailSections } from '../components/PropertyDetailSections';
import { PropertyAppointmentsTab } from '../components/PropertyAppointmentsTab';
import { PropertyFormDrawer } from '../components/PropertyFormDrawer';
import { PropertyFilesPanel, isSubtab } from '@/features/property-files';

export function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canPerform } = usePermissions();
  const { showSuccess, showError } = useSnackbar();
  const { property, isLoading, isError, isGeocodingTimeout, refetch } = usePropertyDetail(id ?? null);
  const [searchParams] = useSearchParams();
  const canViewFiles = canPerform('property_file.read');
  // Deep-link from an appointment's "View all property files" lands on ?tab=files&sub=<subtab>.
  const requestedTab = searchParams.get('tab');
  const requestedSub = searchParams.get('sub');
  const [activeTab, setActiveTab] = useState(() =>
    requestedTab === 'files' && canViewFiles ? 'files' : 'overview',
  );
  const initialSubtab = isSubtab(requestedSub ?? '') ? (requestedSub as 'issues' | 'documents' | 'reports' | 'other') : undefined;
  const [showEdit, setShowEdit] = useState(false);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'appointments', label: 'Appointments' },
    ...(canViewFiles ? [{ id: 'files', label: 'Files' }] : []),
  ];

  const canRetryGeocode = user?.role === 'AM' || user?.role === 'OP';

  const retryGeocodeMutation = useActionMutation(
    `/v1/properties/${id}/geocode`,
    [['properties', id]],
  );

  const handleRetryGeocode = useCallback(() => {
    retryGeocodeMutation.mutate(undefined, {
      onSuccess: () => {
        showSuccess('Geocoding retry initiated.');
        refetch();
      },
      onError: () => {
        showError('Failed to retry geocoding.');
      },
    });
  }, [retryGeocodeMutation, showSuccess, showError, refetch]);

  const handleEdit = useCallback(() => {
    setShowEdit(true);
  }, []);

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Loading..." backTo="/properties" />
        <div className="rounded bg-card-bg p-6 shadow-sm">
          <LoadingState rows={8} />
        </div>
      </div>
    );
  }

  if (isError || !property) {
    return (
      <div className="px-8 py-6">
        <EmptyState
          title="Property not found"
          description="This property does not exist or you do not have permission to view it."
          action={{ label: 'Back to Properties', onClick: () => navigate('/properties') }}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton to="/properties" />
          <h1 className="text-page-title-mobile text-secondary md:text-page-title">
            {property.propertyCode}
          </h1>
          <PropertyTypeChip type={property.type} />
        </div>
        <button
          onClick={handleEdit}
          className="rounded p-2 text-text-secondary hover:bg-black/5"
          aria-label="Edit property"
        >
          <i className="mdi mdi-pencil-outline text-xl" aria-hidden="true" />
        </button>
      </div>

      <div className="rounded bg-card-bg shadow-sm">
        <TabsNav tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        <div className="p-6">
          {activeTab === 'overview' && (
            <>
              <PropertyDetailSections property={property} />

              {property.geocodingStatus === GeocodingStatus.SUCCESS &&
                property.latitude != null &&
                property.longitude != null && (
                  <div className="mt-6">
                    <MapboxPreview
                      latitude={property.latitude}
                      longitude={property.longitude}
                    />
                  </div>
                )}

              {property.geocodingStatus === GeocodingStatus.PENDING && (
                <div className="mt-6">
                  <InfoBanner className={isGeocodingTimeout ? 'bg-warning/10 text-warning' : undefined}>
                    {isGeocodingTimeout
                      ? 'Geocoding is taking longer than expected. Please check the address or retry later.'
                      : 'Geocoding is in progress. The map will appear once coordinates are available.'}
                  </InfoBanner>
                </div>
              )}

              {property.geocodingStatus === GeocodingStatus.FAILED && (
                <div className="mt-6">
                  <InfoBanner className="bg-error/10 text-error">
                    Geocoding failed. Please verify the address or retry.
                  </InfoBanner>
                  {canRetryGeocode && (
                    <div className="mt-3">
                      <Button
                        variant="secondary"
                        loading={retryGeocodeMutation.isPending}
                        onClick={handleRetryGeocode}
                      >
                        <i className="mdi mdi-refresh mr-1" aria-hidden="true" />
                        Retry Geocoding
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {activeTab === 'appointments' && (
            <PropertyAppointmentsTab propertyId={property.id} />
          )}
          {activeTab === 'files' && canViewFiles && (
            <PropertyFilesPanel
              context={{ kind: 'property', propertyId: property.id }}
              initialSubtab={initialSubtab}
            />
          )}
        </div>
      </div>

      <PropertyFormDrawer
        open={showEdit}
        propertyId={property.id}
        onClose={() => setShowEdit(false)}
        onSaved={() => { setShowEdit(false); refetch(); }}
      />
    </div>
  );
}
