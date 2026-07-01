import { useState, useCallback, useEffect } from 'react';
import {
  ReportType,
  ReportDateAxis,
  type AppointmentStatus,
  type ReportFilters,
  type RequestReportInput,
} from '@properfy/shared';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/forms/FormField';
import { SelectInput } from '@/components/forms/SelectInput';
import { DateInput } from '@/components/forms/DateInput';
import { TextInput } from '@/components/forms/TextInput';
import { Checkbox } from '@/components/forms/Checkbox';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';

const REPORT_TYPE_OPTIONS = [
  { value: ReportType.APPOINTMENTS, label: 'Appointments' },
  { value: ReportType.FINANCIAL, label: 'Financial' },
  { value: ReportType.PERFORMANCE, label: 'Performance' },
  { value: ReportType.AGENCIES, label: 'Agencies' },
];

const DATE_AXIS_OPTIONS = [
  { value: ReportDateAxis.SCHEDULED, label: 'Scheduled' },
  { value: ReportDateAxis.CREATED, label: 'Created' },
  { value: ReportDateAxis.COMPLETED, label: 'Completed' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  ...Object.entries(APPOINTMENT_STATUS_MAP).map(([value, config]) => ({
    value,
    label: config.label,
  })),
];

interface GenerateReportDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: RequestReportInput) => void;
  isSubmitting: boolean;
}

interface FormErrors {
  tenantId?: string;
  reportType?: string;
  fromDate?: string;
  toDate?: string;
}

export function GenerateReportDialog({
  open,
  onClose,
  onSubmit,
  isSubmitting,
}: GenerateReportDialogProps) {
  const { user } = useAuth();
  const isGlobalRole = user?.role === 'AM' || user?.role === 'OP';

  const [tenantId, setTenantId] = useState('');
  const [reportType, setReportType] = useState<string>('');
  const [dateAxis, setDateAxis] = useState<string>(ReportDateAxis.SCHEDULED);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [suburb, setSuburb] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [groupProperties, setGroupProperties] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const isAppointments = reportType === ReportType.APPOINTMENTS;
  const isFinancial = reportType === ReportType.FINANCIAL;

  const { options: tenantOptions } = useFormOptions<{ id: string; name: string }>(
    ['reports', 'tenant-options'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isGlobalRole && open },
  );

  // Branch options come from the shared useFormOptions hook — the app-wide
  // typed wrapper over the generated openapi-fetch client used by every branch
  // selector. /v1/branches is tenant-scoped, so options are keyed off the
  // selected agency (global roles) or the caller's own tenant (client roles).
  const branchScopeTenantId = isGlobalRole ? tenantId : (user?.tenantId ?? '');
  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['reports', 'branch-options', branchScopeTenantId],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    { tenantId: branchScopeTenantId },
    { enabled: !!branchScopeTenantId && open },
  );

  // Only prepend the empty "All branches" option once a tenant scope exists
  // (i.e. the select is enabled). While disabled, keep the list empty so
  // SelectInput falls back to its placeholder instead of rendering the empty
  // option's label (it shows the label for value === '' before the placeholder).
  const branchOptionsWithAll = branchScopeTenantId
    ? [{ value: '', label: 'All branches' }, ...branchOptions]
    : [];

  const resetForm = useCallback(() => {
    setTenantId('');
    setReportType('');
    setDateAxis(ReportDateAxis.SCHEDULED);
    setFromDate('');
    setToDate('');
    setSuburb('');
    setBranchId('');
    setStatus('');
    setGroupProperties(false);
    setErrors({});
  }, []);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    if (isGlobalRole && !tenantId) errs.tenantId = 'Agency is required';
    if (!reportType) errs.reportType = 'Report type is required';
    if (!fromDate) errs.fromDate = 'Start date is required';
    if (!toDate) errs.toDate = 'End date is required';
    if (fromDate && toDate && toDate < fromDate) errs.toDate = 'End date must be after start date';
    return errs;
  };

  const handleSubmit = useCallback(() => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const filters: ReportFilters = {
      fromDate,
      toDate,
      dateAxis: isFinancial ? ReportDateAxis.SCHEDULED : (dateAxis as ReportDateAxis),
      groupProperties: isAppointments ? groupProperties : false,
      ...(isGlobalRole && tenantId ? { tenantId } : {}),
      ...(branchId ? { branchId } : {}),
      ...(suburb.trim() ? { suburb: suburb.trim() } : {}),
      ...(isAppointments && status ? { status: status as AppointmentStatus } : {}),
    };

    onSubmit({ reportType: reportType as ReportType, filters });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isGlobalRole,
    tenantId,
    reportType,
    dateAxis,
    fromDate,
    toDate,
    suburb,
    branchId,
    status,
    groupProperties,
    isAppointments,
    isFinancial,
    onSubmit,
  ]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  return (
    <Dialog open={open} onClose={handleClose} title="Generate Report">
      <div className="flex flex-col gap-4 p-6">
        {isGlobalRole && (
          <FormField label="Agency" required error={errors.tenantId}>
            <SelectInput
              value={tenantId}
              onChange={(value) => {
                setTenantId(value);
                setBranchId('');
                setErrors((prev) => ({ ...prev, tenantId: undefined }));
              }}
              options={tenantOptions}
              placeholder="Select agency"
              error={!!errors.tenantId}
              aria-label="Agency"
            />
          </FormField>
        )}

        <FormField label="Report Type" required error={errors.reportType}>
          <SelectInput
            value={reportType}
            onChange={(v) => {
              setReportType(v);
              setErrors((prev) => ({ ...prev, reportType: undefined }));
            }}
            options={REPORT_TYPE_OPTIONS}
            placeholder="Select report type"
            error={!!errors.reportType}
            aria-label="Report Type"
          />
        </FormField>

        {!isFinancial && (
          <FormField label="Date Axis">
            <SelectInput
              value={dateAxis}
              onChange={setDateAxis}
              options={DATE_AXIS_OPTIONS}
              aria-label="Date Axis"
            />
          </FormField>
        )}

        <FormField label="From Date" required error={errors.fromDate}>
          <DateInput
            value={fromDate}
            onChange={(v) => {
              setFromDate(v);
              setErrors((prev) => ({ ...prev, fromDate: undefined }));
            }}
            error={!!errors.fromDate}
            aria-label="From Date"
          />
        </FormField>

        <FormField label="To Date" required error={errors.toDate}>
          <DateInput
            value={toDate}
            onChange={(v) => {
              setToDate(v);
              setErrors((prev) => ({ ...prev, toDate: undefined }));
            }}
            error={!!errors.toDate}
            aria-label="To Date"
          />
        </FormField>

        <FormField label="Suburb">
          <TextInput
            value={suburb}
            onChange={setSuburb}
            placeholder="Filter by suburb"
            maxLength={120}
            aria-label="Suburb"
          />
        </FormField>

        <FormField label="Branch">
          <SelectInput
            value={branchId}
            onChange={setBranchId}
            options={branchOptionsWithAll}
            disabled={!branchScopeTenantId}
            placeholder={branchScopeTenantId ? 'All branches' : 'Select an agency first'}
            aria-label="Branch"
          />
        </FormField>

        {isAppointments && (
          <FormField label="Status">
            <SelectInput
              value={status}
              onChange={setStatus}
              options={STATUS_OPTIONS}
              aria-label="Status"
            />
          </FormField>
        )}

        {isAppointments && (
          <Checkbox
            checked={groupProperties}
            onChange={setGroupProperties}
            label="Group by property"
          />
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-black/10 px-6 py-4">
        <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSubmit} loading={isSubmitting}>
          Generate
        </Button>
      </div>
    </Dialog>
  );
}
