import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createServiceGroupSchema, UserRole, currentTimeInTzHHmm, todayInTzDateString, PLATFORM_TIMEZONE } from '@properfy/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { SelectInput } from '@/components/forms/SelectInput';
import { DateInput } from '@/components/forms/DateInput';
import { RegionSelector } from '../components/RegionSelector';
import { Textarea } from '@/components/forms/Textarea';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useGoBack } from '@/hooks/useGoBack';
import { api } from '@/services/api';
import { EligibleAppointmentsTable } from '../components/EligibleAppointmentsTable';
import { SelectionCounter } from '../components/SelectionCounter';
import { TimeWindowPicker } from '../components/TimeWindowPicker';
import { GroupSummaryCard } from '../components/GroupSummaryCard';
import { useEligibleAppointments } from '../hooks/useEligibleAppointments';

export function ServiceGroupCreatePage() {
  const navigate = useNavigate();
  const goBack = useGoBack('/service-groups');
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
  const [serviceRegionId, setServiceRegionId] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const effectiveTenantId = isGlobalRole ? selectedTenantId : undefined;
  const requiresTenantSelection = isGlobalRole && !selectedTenantId;

  const { data: eligibleAppointments, isLoading: loadingAppointments } =
    useEligibleAppointments(serviceTypeId || null, effectiveTenantId);

  const selectedServiceType = serviceTypeOptions.find((o) => o.value === serviceTypeId);
  const createPayload = {
    appointmentIds: selectedIds,
    serviceTypeId,
    scheduledDate,
    timeWindow: `${startTime}-${endTime}`,
    serviceRegionId: serviceRegionId || undefined,
    ...(description ? { description } : {}),
  };
  const parsedCreatePayload = createServiceGroupSchema.safeParse(createPayload);

  const isSelectionValid = selectedIds.length >= 1;

  const isDirty = selectedTenantId !== '' || serviceTypeId !== '' || selectedIds.length > 0 || scheduledDate !== '' || serviceRegionId !== '' || description !== '';

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
      goBack();
    }
  }, [step, isDirty, goBack]);

  const handleNavigateBack = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      goBack();
    }
  }, [isDirty, goBack]);

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
      const groupCode = (data as { data?: { code?: string } } | undefined)?.data?.code;
      showSuccess(groupCode ? `Service group ${groupCode} created` : 'Service group created');
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
    goBack();
  }, [goBack]);

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
                  <SelectionCounter count={selectedIds.length} />
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
                  min={todayInTzDateString(PLATFORM_TIMEZONE)}
                  aria-label="Scheduled Date"
                />
              </FormField>
              <p className="mt-1 text-xs text-text-muted">
                Appointments scheduled on a different date will be moved to this date when the group is created.
              </p>
            </FormSection>

            <FormSection title="Time Window">
              <TimeWindowPicker
                startTime={startTime}
                endTime={endTime}
                onStartTimeChange={setStartTime}
                onEndTimeChange={setEndTime}
                minStartTime={(() => {
                  const today = todayInTzDateString(PLATFORM_TIMEZONE);
                  return scheduledDate === today ? currentTimeInTzHHmm(PLATFORM_TIMEZONE) : undefined;
                })()}
              />
            </FormSection>

            <GroupSummaryCard
              appointmentCount={selectedIds.length}
              serviceType={selectedServiceType?.label ?? ''}
              scheduledDate={scheduledDate}
              timeWindow={timeWindow}
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
