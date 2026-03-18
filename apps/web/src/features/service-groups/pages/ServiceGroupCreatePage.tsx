import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { SelectInput } from '@/components/forms/SelectInput';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useFormOptions } from '@/hooks/useFormOptions';
import { api } from '@/services/api';
import { EligibleAppointmentsTable } from '../components/EligibleAppointmentsTable';
import { SelectionCounter } from '../components/SelectionCounter';
import { TimeWindowPicker } from '../components/TimeWindowPicker';
import { PriorityModeSelect } from '../components/PriorityModeSelect';
import { GroupSummaryCard } from '../components/GroupSummaryCard';
import { useEligibleAppointments } from '../hooks/useEligibleAppointments';

const MIN_APPOINTMENTS = 5;
const MAX_APPOINTMENTS = 25;

export function ServiceGroupCreatePage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useSnackbar();
  const queryClient = useQueryClient();

  const { options: serviceTypeOptions } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'form-options'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
  );

  // Wizard state
  const [step, setStep] = useState<1 | 2>(1);
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [priorityMode, setPriorityMode] = useState('STANDARD');
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: eligibleAppointments, isLoading: loadingAppointments } =
    useEligibleAppointments(serviceTypeId || null);

  const selectedServiceType = serviceTypeOptions.find((o) => o.value === serviceTypeId);

  const isSelectionValid =
    selectedIds.length >= MIN_APPOINTMENTS && selectedIds.length <= MAX_APPOINTMENTS;

  const isDirty = serviceTypeId !== '' || selectedIds.length > 0;

  const handleNext = useCallback(() => {
    setStep(2);
  }, []);

  const handleBack = useCallback(() => {
    if (step === 2) {
      setStep(1);
    } else if (isDirty) {
      setShowConfirm(true);
    } else {
      navigate(-1);
    }
  }, [step, isDirty, navigate]);

  const handleNavigateBack = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      navigate(-1);
    }
  }, [isDirty, navigate]);

  const handleSubmit = useCallback(async () => {
    setIsSaving(true);
    try {
      const { data, error } = await api.POST('/v1/service-groups' as any, {
        body: {
          appointmentIds: selectedIds,
          serviceTypeId,
          startTime,
          endTime,
          priorityMode,
        } as any,
      });
      if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      queryClient.invalidateQueries({ queryKey: ['service-groups'] });
      showSuccess('Service group created');
      const newId = (data as any)?.data?.id ?? (data as any)?.id;
      if (newId) {
        navigate(`/service-groups/${newId}`);
      } else {
        navigate('/service-groups');
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create service group');
    } finally {
      setIsSaving(false);
    }
  }, [selectedIds, serviceTypeId, startTime, endTime, priorityMode, navigate, showSuccess, showError, queryClient]);

  const forceBack = useCallback(() => {
    setShowConfirm(false);
    navigate(-1);
  }, [navigate]);

  const timeWindow = startTime && endTime ? `${startTime} - ${endTime}` : '';

  return (
    <>
      <PageHeader
        title="New Service Group"
        secondaryActions={[
          {
            label: 'Back',
            icon: 'mdi-arrow-left',
            onClick: handleNavigateBack,
          },
        ]}
      />

      <div className="rounded bg-card-bg p-6 shadow-sm">
        {/* Step indicators */}
        <div className="mb-6 flex items-center gap-4">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
              step === 1 ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
            }`}
          >
            1
          </div>
          <span className={`text-sm font-medium ${step === 1 ? 'text-text-primary' : 'text-text-muted'}`}>
            Select Appointments
          </span>
          <div className="h-px flex-1 bg-border-subtle" />
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
              step === 2 ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
            }`}
          >
            2
          </div>
          <span className={`text-sm font-medium ${step === 2 ? 'text-text-primary' : 'text-text-muted'}`}>
            Configure & Create
          </span>
        </div>

        {/* Step 1: Select appointments */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <FormSection title="Filters" columns={2}>
              <FormField label="Service Type" required>
                <SelectInput
                  value={serviceTypeId}
                  onChange={(v) => {
                    setServiceTypeId(v);
                    setSelectedIds([]);
                  }}
                  options={serviceTypeOptions}
                  placeholder="Select service type"
                  aria-label="Service Type"
                />
              </FormField>
            </FormSection>

            {serviceTypeId && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary">
                    Eligible Appointments
                  </h3>
                  <SelectionCounter count={selectedIds.length} min={MIN_APPOINTMENTS} max={MAX_APPOINTMENTS} />
                </div>
                <EligibleAppointmentsTable
                  appointments={eligibleAppointments}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  loading={loadingAppointments}
                />
              </>
            )}

            <div className="mt-4">
              <FormActions>
                <Button variant="secondary" onClick={handleBack}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={!isSelectionValid}
                  onClick={handleNext}
                >
                  Next
                </Button>
              </FormActions>
            </div>
          </div>
        )}

        {/* Step 2: Configure & confirm */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <FormSection title="Time Window">
              <TimeWindowPicker
                startTime={startTime}
                endTime={endTime}
                onStartTimeChange={setStartTime}
                onEndTimeChange={setEndTime}
              />
            </FormSection>

            <FormSection title="Priority">
              <PriorityModeSelect value={priorityMode} onChange={setPriorityMode} />
            </FormSection>

            <GroupSummaryCard
              appointmentCount={selectedIds.length}
              serviceType={selectedServiceType?.label ?? ''}
              timeWindow={timeWindow}
              priorityMode={priorityMode}
            />

            <div className="mt-4">
              <FormActions>
                <Button variant="secondary" onClick={handleBack}>
                  Back
                </Button>
                <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                  Create Group
                </Button>
              </FormActions>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="Discard changes?"
        message="You have unsaved changes. Do you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Continue editing"
        variant="warning"
        onConfirm={forceBack}
        onClose={() => setShowConfirm(false)}
      />
    </>
  );
}
