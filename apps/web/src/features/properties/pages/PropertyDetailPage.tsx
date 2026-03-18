import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GeocodingStatus } from '@properfy/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabsNav } from '@/components/layout/TabsNav';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { MapboxPreview } from '@/components/map/MapboxPreview';
import { usePropertyDetail } from '../hooks/usePropertyDetail';
import { PropertyTypeChip } from '../components/PropertyTypeChip';
import { PropertyDetailSections } from '../components/PropertyDetailSections';
import { PropertyAppointmentsTab } from '../components/PropertyAppointmentsTab';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'appointments', label: 'Appointments' },
];

export function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { property, isLoading, isError, refetch } = usePropertyDetail(id ?? null);
  const [activeTab, setActiveTab] = useState('overview');

  const handleEdit = useCallback(() => {
    navigate('/properties');
  }, [navigate]);

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

  if (isError || !property) {
    return (
      <div>
        <PageHeader
          title="Property"
          secondaryActions={[
            { label: 'Back', icon: 'mdi-arrow-left', onClick: () => navigate(-1) },
          ]}
        />
        <div className="rounded bg-card-bg p-6 shadow-sm">
          <ErrorState
            message="Failed to load property details"
            onRetry={refetch}
          />
        </div>
      </div>
    );
  }

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
          <h1 className="text-page-title text-secondary md:text-page-title mobile:text-page-title-mobile">
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
        <TabsNav tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

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
                  <InfoBanner>
                    Geocoding is in progress. The map will appear once coordinates are available.
                  </InfoBanner>
                </div>
              )}

              {property.geocodingStatus === GeocodingStatus.FAILED && (
                <div className="mt-6">
                  <InfoBanner className="bg-error/10 text-error">
                    Geocoding failed. Please verify the address or retry.
                  </InfoBanner>
                </div>
              )}
            </>
          )}
          {activeTab === 'appointments' && (
            <PropertyAppointmentsTab propertyId={property.id} />
          )}
        </div>
      </div>
    </div>
  );
}
