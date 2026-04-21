import { useState, useEffect, useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { SelectInput, type SelectOption } from '@/components/forms/SelectInput';
import { Checkbox } from '@/components/forms/Checkbox';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useSnackbar } from '@/hooks/useSnackbar';
import { ReportType } from '@properfy/shared';
import { RecurrenceSelector } from './RecurrenceSelector';
import { DeliveryModeSelector } from './DeliveryModeSelector';
import { useScheduledReportMutations } from '../hooks/useScheduledReportMutations';
import type {
  ScheduledReport,
  CreateScheduledReportPayload,
  StructuredRecurrence,
  ScheduleDeliveryMode,
} from '../types';

const REPORT_TYPE_OPTIONS: SelectOption[] = Object.values(ReportType).map((v) => ({
  value: v,
  label: v
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' '),
}));

const DEFAULT_RECURRENCE: StructuredRecurrence = { type: 'daily', hour: 8 };
const DEFAULT_DELIVERY_MODE: ScheduleDeliveryMode = 'OWNER_ONLY';

interface FormData {
  displayName: string;
  reportType: string;
  recurrence: StructuredRecurrence;
  deliveryMode: ScheduleDeliveryMode;
  recipientUserIds: string;
  skipDeliveryWhenEmpty: boolean;
}

interface FormErrors {
  displayName?: string;
  reportType?: string;
}

const EMPTY_FORM: FormData = {
  displayName: '',
  reportType: '',
  recurrence: DEFAULT_RECURRENCE,
  deliveryMode: DEFAULT_DELIVERY_MODE,
  recipientUserIds: '',
  skipDeliveryWhenEmpty: false,
};

function formFromSchedule(schedule: ScheduledReport): FormData {
  let recurrence: StructuredRecurrence = DEFAULT_RECURRENCE;
  const parts = schedule.cronExpression.trim().split(/\s+/);
  const minute = Number(parts[0] ?? '0');
  const hour = Number(parts[1] ?? '8');
  const dayOfMonth = parts[2] ?? '*';
  const dayOfWeek = parts[4] ?? '*';
  if (dayOfMonth !== '*') {
    recurrence = { type: 'monthly', dayOfMonth: Number(dayOfMonth), hour };
  } else if (dayOfWeek !== '*') {
    recurrence = { type: 'weekly', dayOfWeek: Number(dayOfWeek), hour };
  } else {
    recurrence = { type: 'daily', hour };
  }
  void minute; // cron minute is always 0 in structured form

  return {
    displayName: schedule.displayName ?? '',
    reportType: schedule.reportType,
    recurrence,
    deliveryMode: schedule.deliveryMode,
    recipientUserIds: schedule.recipientUserIds.join(', '),
    skipDeliveryWhenEmpty: schedule.skipDeliveryWhenEmpty,
  };
}

function validate(form: FormData): FormErrors {
  const errors: FormErrors = {};
  if (!form.reportType) errors.reportType = 'Required field';
  return errors;
}

interface ScheduledReportFormDrawerProps {
  open: boolean;
  onClose: () => void;
  schedule?: ScheduledReport | null;
  onSaved: () => void;
}

/**
 * Feature 019 T089: create / edit drawer for a report schedule.
 */
export function ScheduledReportFormDrawer({
  open,
  onClose,
  schedule,
  onSaved,
}: ScheduledReportFormDrawerProps) {
  const isEditMode = !!schedule;
  const { createScheduledReport, updateScheduledReport, isMutating } =
    useScheduledReportMutations();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [initialData, setInitialData] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && schedule) {
      const data = formFromSchedule(schedule);
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, schedule]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_FORM);
      setInitialData(EMPTY_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if ((prev as Record<string, unknown>)[field]) {
        const next = { ...prev };
        delete (next as Record<string, unknown>)[field];
        return next;
      }
      return prev;
    });
  }, []);

  const buildPayload = useCallback((): CreateScheduledReportPayload => {
    const recipientUserIds = form.recipientUserIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      reportType: form.reportType as CreateScheduledReportPayload['reportType'],
      filtersJson: {},
      format: 'XLSX',
      recurrence: form.recurrence,
      deliveryMode: form.deliveryMode,
      recipientUserIds,
      displayName: form.displayName || undefined,
      skipDeliveryWhenEmpty: form.skipDeliveryWhenEmpty,
    };
  }, [form]);

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const payload = buildPayload();
    const result = isEditMode && schedule
      ? await updateScheduledReport(schedule.id, payload)
      : await createScheduledReport(payload);

    if (result.success) {
      showSuccess(isEditMode ? 'Schedule updated' : 'Schedule created');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [
    form,
    buildPayload,
    isEditMode,
    schedule,
    createScheduledReport,
    updateScheduledReport,
    showSuccess,
    showError,
    onSaved,
  ]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const forceClose = useCallback(() => {
    setShowConfirm(false);
    onClose();
  }, [onClose]);

  return (
    <>
      <DrawerPanel open={open} onClose={handleClose} size="narrow">
        <div className="flex h-full flex-col">
          <DrawerHeader
            title={isEditMode ? 'Edit Schedule' : 'New Schedule'}
            onClose={handleClose}
          />

          {isEditMode && !schedule ? (
            <div className="flex-1 px-6 py-4">
              <LoadingState rows={5} />
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="flex flex-col gap-6">
                  <FormSection title="Schedule Details">
                    <FormField label="Display name">
                      <TextInput
                        value={form.displayName}
                        onChange={(v) => updateField('displayName', v)}
                        placeholder="e.g. Weekly Inspections Report"
                        aria-label="Display name"
                      />
                    </FormField>

                    <FormField label="Report type" required error={errors.reportType}>
                      <SelectInput
                        value={form.reportType}
                        onChange={(v) => updateField('reportType', v)}
                        options={REPORT_TYPE_OPTIONS}
                        placeholder="Select report type"
                        error={!!errors.reportType}
                        aria-label="Report type"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Recurrence">
                    <RecurrenceSelector
                      value={form.recurrence}
                      onChange={(v) => updateField('recurrence', v)}
                    />
                  </FormSection>

                  <FormSection title="Delivery">
                    <FormField label="Delivery mode" required>
                      <DeliveryModeSelector
                        value={form.deliveryMode}
                        onChange={(v) => updateField('deliveryMode', v)}
                      />
                    </FormField>

                    {form.deliveryMode === 'RECIPIENT_LIST' && (
                      <FormField label="Recipient user IDs" required>
                        <TextInput
                          value={form.recipientUserIds}
                          onChange={(v) => updateField('recipientUserIds', v)}
                          placeholder="Comma-separated user IDs"
                          aria-label="Recipient user IDs"
                        />
                      </FormField>
                    )}

                    <Checkbox
                      label="Skip delivery when report has no data"
                      checked={form.skipDeliveryWhenEmpty}
                      onChange={(v) => updateField('skipDeliveryWhenEmpty', v)}
                    />
                  </FormSection>
                </div>
              </div>

              <div className="border-t border-black/10 px-6 py-4">
                <FormActions>
                  <Button variant="secondary" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={isMutating} onClick={handleSubmit}>
                    {isEditMode ? 'Save' : 'Create Schedule'}
                  </Button>
                </FormActions>
              </div>
            </>
          )}
        </div>
      </DrawerPanel>

      <ConfirmDialog
        open={showConfirm}
        title="Discard changes?"
        message="You have unsaved changes. Do you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Continue editing"
        variant="warning"
        onConfirm={forceClose}
        onClose={() => setShowConfirm(false)}
      />
    </>
  );
}
