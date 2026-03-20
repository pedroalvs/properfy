import { useState, useCallback } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/forms/FormField';
import { SelectInput } from '@/components/forms/SelectInput';
import { DateInput } from '@/components/forms/DateInput';
import { Button } from '@/components/ui/Button';

const REPORT_TYPE_OPTIONS = [
  { value: 'INSPECTIONS_SCHEDULED', label: 'Scheduled Inspections' },
  { value: 'INSPECTIONS_DONE', label: 'Completed Inspections' },
  { value: 'INSPECTIONS_CANCELLED', label: 'Cancelled Inspections' },
  { value: 'INSPECTIONS_REJECTED', label: 'Rejected Inspections' },
  { value: 'INSPECTOR_PERFORMANCE', label: 'Inspector Performance' },
  { value: 'CONFIRMATION_STATUS', label: 'Confirmation Status' },
  { value: 'FINANCIAL_SERVICES', label: 'Financial Services' },
];

interface GenerateReportDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reportType: string, fromDate: string, toDate: string) => Promise<void>;
  isSubmitting: boolean;
}

interface FormErrors {
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
  const [reportType, setReportType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    if (!reportType) errs.reportType = 'Report type is required';
    if (!fromDate) errs.fromDate = 'Start date is required';
    if (!toDate) errs.toDate = 'End date is required';
    if (fromDate && toDate && toDate < fromDate) errs.toDate = 'End date must be after start date';
    return errs;
  };

  const handleSubmit = useCallback(async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    await onSubmit(reportType, fromDate, toDate);
    setReportType('');
    setFromDate('');
    setToDate('');
    setErrors({});
  }, [reportType, fromDate, toDate, onSubmit]);

  const handleClose = useCallback(() => {
    setReportType('');
    setFromDate('');
    setToDate('');
    setErrors({});
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onClose={handleClose} title="Generate Report">
      <div className="flex flex-col gap-4 p-6">
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
