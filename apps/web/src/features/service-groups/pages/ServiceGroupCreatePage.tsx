import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createServiceGroupSchema, UserRole, ServiceGroupExceptionType } from '@properfy/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { SelectInput } from '@/components/forms/SelectInput';
import { TextInput } from '@/components/forms/TextInput';
import { DateInput } from '@/components/forms/DateInput';
import { RegionSelector } from '../components/RegionSelector';
import { Textarea } from '@/components/forms/Textarea';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAuth } from '@/hooks/useAuth';
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

const EXCEPTION_TYPE_OPTIONS = [
  { value: ServiceGroupExceptionType.LOW_DENSITY_REGION, label: 'Low Density Region (max 25)' },
  { value: ServiceGroupExceptionType.ISOLATED_SERVICE,   label: 'Isolated Service (max 3)' },
  { value: ServiceGroupExceptionType.PRIORITY_CLIENT,    label: 'Priority Client (max 8)' },
];

export function ServiceGroupCreatePage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useSnackbar();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isGlobalRole = user?.role === UserRole.AM || user?.role === UserRole.OP;

  const { options: serviceTypeOptions } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'form-options'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
  );

  const { options: tenantOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'form-options'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    { enabled: isGlobalRole },
  );

  // Wizard state
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [priorityMode, setPriorityMode] = useState('STANDARD');
  const [groupName, setGroupName] = useState('');
  const [serviceRegionId, setServiceRegionId] = useState('');
  const [description, setDescription] = useState('');
  const [exceptionType, setExceptionType] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const effectiveTenantId = isGlobalRole ? selectedTenantId : undefined;
  const requiresTenantSelection = isGlobalRole && !selectedTenantId;

  const { data: eligibleAppointments, isLoading: loadingAppointments } =
    useEligibleAppointments(serviceTypeId || null, effectiveTenantId);

  const selectedServiceType = serviceTypeOptions.find((o) => o.value === serviceTypeId);
  const needsException = selectedIds.length > 0 && selectedIds.length < MIN_APPOINTMENTS;
  const createPayload = {
    appointmentIds: selectedIds,
    serviceTypeId,
    scheduledDate,
    timeWindow: `${startTime}-${endTime}`,
    ...(groupName ? { name: groupName } : {}),
    serviceRegionId: serviceRegionId || undefined,
    ...(description ? { description } : {}),
    priorityMode,
    ...(exceptionType ? { exceptionType, exceptionReason: exceptionReason || undefined } : {}),
  };
  const parsedCreatePayload = createServiceGroupSchema.safeParse(createPayload);

  const isSelectionValid =
    (selectedIds.length >= MIN_APPOINTMENTS && selectedIds.length <= MAX_APPOINTMENTS) ||
    (needsException && !!exceptionType && exceptionReason.length >= 10);

  const isDirty = selectedTenantId !== '' || serviceTypeId !== '' || selectedIds.length > 0 || scheduledDate !== '' || groupName !== '' || serviceRegionId !== '' || description !== '' || exceptionType !== '' || exceptionReason !== '';

  const handleNext = useCallback(() => {
    setStep(2);
  }, []);

  const handleBack = useCallback(() => {
    if (step === 2) {
      setStep(1);
      setServiceRegionId('');
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
      if (!parsedCreatePayload.success) {
        showError('Select a valid date and time window before creating the group');
        return;
      }

      const { data, error } = await api.POST('/v1/service-groups' as any, {
        body: parsedCreatePayload.data as any,
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
  }, [navigate, parsedCreatePayload, queryClient, showError, showSuccess]);

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
              {isGlobalRole && (
                <FormField label="Agency" required>
                  <SelectInput
                    value={selectedTenantId}
                    onChange={(value) => {
                      setSelectedTenantId(value);
                      setServiceTypeId('');
                      setSelectedIds([]);
                    }}
                    options={tenantOptions}
                    placeholder="Select agency"
                    aria-label="Agency"
                  />
                </FormField>
              )}
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
                  disabled={requiresTenantSelection}
                />
              </FormField>
            </FormSection>

            {requiresTenantSelection && (
              <p className="text-sm text-text-secondary">
                Select an agency before loading eligible appointments.
              </p>
            )}

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

                {needsException && (
                  <div className="rounded border border-warning/40 bg-warning/5 p-4">
                    <InfoBanner>
                      {selectedIds.length} appointment{selectedIds.length === 1 ? '' : 's'} selected — below the standard minimum of {MIN_APPOINTMENTS}. An exception is required to proceed.
                    </InfoBanner>
                    <div className="mt-4 flex flex-col gap-4">
                      <FormField label="Exception Type" required>
                        <SelectInput
                          value={exceptionType}
                          onChange={(v) => {
                            setExceptionType(v);
                            setExceptionReason('');
                          }}
                          options={EXCEPTION_TYPE_OPTIONS}
                          placeholder="Select exception type"
                          aria-label="Exception Type"
                        />
                      </FormField>
                      {exceptionType && (
                        <FormField label="Exception Reason" required>
                          <Textarea
                            value={exceptionReason}
                            onChange={setExceptionReason}
                            placeholder="Describe why this exception applies (minimum 10 characters)"
                            rows={3}
                            aria-label="Exception Reason"
                          />
                        </FormField>
                      )}
                    </div>
                  </div>
                )}
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
            <FormSection title="Group Details" columns={2}>
              <FormField label="Name">
                <TextInput
                  value={groupName}
                  onChange={setGroupName}
                  placeholder="e.g. Bondi Beach Routine"
                  aria-label="Group Name"
                />
              </FormField>
              <div />
            </FormSection>

            <FormSection title="Region">
              <RegionSelector
                appointmentIds={selectedIds}
                selectedRegionId={serviceRegionId}
                onRegionChange={setServiceRegionId}
                tenantId={effectiveTenantId}
              />
            </FormSection>

            <FormSection title="Notes">
              <FormField label="Description">
                <Textarea
                  value={description}
                  onChange={setDescription}
                  placeholder="Optional notes about this service group"
                  rows={3}
                  aria-label="Description"
                />
              </FormField>
            </FormSection>

            <FormSection title="Schedule">
              <FormField label="Scheduled Date" required>
                <DateInput
                  value={scheduledDate}
                  onChange={setScheduledDate}
                  aria-label="Scheduled Date"
                />
              </FormField>
            </FormSection>

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
              scheduledDate={scheduledDate}
              timeWindow={timeWindow}
              priorityMode={priorityMode}
            />

            <div className="mt-4">
              <FormActions>
                <Button variant="secondary" onClick={handleBack}>
                  Back
                </Button>
                <Button variant="primary" loading={isSaving} disabled={!parsedCreatePayload.success} onClick={handleSubmit}>
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
