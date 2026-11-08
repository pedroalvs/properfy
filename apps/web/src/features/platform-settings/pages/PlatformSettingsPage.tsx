import { useCallback, useRef, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FieldEventsSettingsSection } from '../components/FieldEventsSettingsSection';
import { RouteWeightsSettingsSection } from '../components/RouteWeightsSettingsSection';
import { TenantEtaNoticesSection } from '../components/TenantEtaNoticesSection';
import { LiveDayAlertsSettingsSection } from '../components/LiveDayAlertsSettingsSection';
import { ReliabilityIndexSection } from '../components/ReliabilityIndexSection';
import { PropertyFilesSettingsSection } from '../components/PropertyFilesSettingsSection';
import { InspectorProgramSettingsSection } from '../components/InspectorProgramSettingsSection';

/**
 * Platform settings (AM/OP). One section per `PLATFORM_SETTINGS_REGISTRY` key —
 * this task ships only "Field events". A future feature adds configuration by
 * appending a key to the shared registry and rendering one more section here,
 * each using the generic `usePlatformSetting(key)` hook; it never edits this
 * page's plumbing.
 *
 * The Back button warns before leaving with unsaved changes (the standard
 * edit-screen discard confirmation), driven by the section's dirty state.
 */
export function PlatformSettingsPage() {
  const [fieldEventsDirty, setFieldEventsDirty] = useState(false);
  const [routeWeightsDirty, setRouteWeightsDirty] = useState(false);
  const [tenantEtaDirty, setTenantEtaDirty] = useState(false);
  const [liveDayAlertsDirty, setLiveDayAlertsDirty] = useState(false);
  const [reliabilityDirty, setReliabilityDirty] = useState(false);
  const [propertyFilesDirty, setPropertyFilesDirty] = useState(false);
  const [inspectorProgramDirty, setInspectorProgramDirty] = useState(false);
  const dirty =
    fieldEventsDirty ||
    routeWeightsDirty ||
    tenantEtaDirty ||
    liveDayAlertsDirty ||
    reliabilityDirty ||
    propertyFilesDirty ||
    inspectorProgramDirty;
  const [showDiscard, setShowDiscard] = useState(false);
  const pendingGoBack = useRef<(() => void) | null>(null);

  const handleBack = useCallback(
    (goBack: () => void) => {
      if (dirty) {
        pendingGoBack.current = goBack;
        setShowDiscard(true);
        return;
      }
      goBack();
    },
    [dirty],
  );

  const confirmDiscard = useCallback(() => {
    setShowDiscard(false);
    pendingGoBack.current?.();
    pendingGoBack.current = null;
  }, []);

  return (
    <div>
      <PageHeader title="Platform settings" backTo="/dashboard" onBack={handleBack} />

      <div className="flex flex-col gap-6">
        <FieldEventsSettingsSection onDirtyChange={setFieldEventsDirty} />
        <RouteWeightsSettingsSection onDirtyChange={setRouteWeightsDirty} />
        <TenantEtaNoticesSection onDirtyChange={setTenantEtaDirty} />
        <LiveDayAlertsSettingsSection onDirtyChange={setLiveDayAlertsDirty} />
        <ReliabilityIndexSection onDirtyChange={setReliabilityDirty} />
        <PropertyFilesSettingsSection onDirtyChange={setPropertyFilesDirty} />
        <InspectorProgramSettingsSection onDirtyChange={setInspectorProgramDirty} />
      </div>

      <ConfirmDialog
        open={showDiscard}
        title="Discard changes?"
        message="You have unsaved changes. Do you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Continue editing"
        variant="warning"
        onConfirm={confirmDiscard}
        onClose={() => setShowDiscard(false)}
      />
    </div>
  );
}
