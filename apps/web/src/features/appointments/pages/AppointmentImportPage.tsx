import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { UserRole } from '@properfy/shared';
import type { AppointmentImportPreviewResponse } from '@properfy/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { ImportWizard, FileUploadStep, ProgressStep } from '@/components/import';
import { FormField } from '@/components/forms/FormField';
import { SelectInput } from '@/components/forms/SelectInput';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useFormOptions } from '@/hooks/useFormOptions';
import { api } from '@/services/api';
import { useAppointmentImport } from '../hooks/useAppointmentImport';
import { AppointmentImportPreview } from '../components/AppointmentImportPreview';

const STEPS = ['Upload', 'Preview', 'Confirm', 'Progress'];

async function downloadErrorsCsv(importId: string, onError: (message: string) => void) {
  try {
    // Routed through the shared client (not a bespoke fetch) so auth
    // headers and the 401-refresh-and-retry flow apply here too.
    const { data, error } = await api.GET('/v1/appointments/import/{importId}/errors.csv' as any, {
      params: { path: { importId } } as any,
      parseAs: 'blob',
    } as any);

    if (error || !data) {
      onError('Failed to download the errors file');
      return;
    }

    const url = URL.createObjectURL(data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-${importId}-errors.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    onError('Failed to download the errors file');
  }
}

export function AppointmentImportPage() {
  const { user } = useAuth();
  const { showError } = useSnackbar();
  const isGlobalRole = user?.role === UserRole.AM || user?.role === UserRole.OP;

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<AppointmentImportPreviewResponse | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [showValidOnlyConfirm, setShowValidOnlyConfirm] = useState(false);

  const effectiveTenantId = isGlobalRole ? selectedTenantId : undefined;
  const requiresTenantSelection = isGlobalRole && !selectedTenantId;

  const { options: tenantOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'appointment-import'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isGlobalRole },
  );

  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'appointment-import', effectiveTenantId ?? ''],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    { ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}), status: 'ACTIVE' },
    { enabled: !isGlobalRole || !!effectiveTenantId },
  );

  // Switching agency invalidates the previously selected branch — the
  // server derives tenant scope from branchId, so keeping a stale branch
  // selected after an agency switch would silently import into the wrong
  // agency.
  useEffect(() => {
    if (!isGlobalRole) return;
    setBranchId('');
  }, [isGlobalRole, selectedTenantId]);

  const { preview, isPreviewing, commit, isCommitting, importStatus } = useAppointmentImport();

  const canPreview = !!selectedFile && !!branchId && !requiresTenantSelection;

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
  }, []);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
  }, []);

  const runPreview = useCallback(async () => {
    if (!selectedFile || !branchId) return;
    setPreviewFailed(false);
    const actorTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const result = await preview(selectedFile, branchId, actorTimezone);
    // Advance to the Preview step either way — a failure renders its
    // inline ErrorState there (with retry), instead of leaving the user
    // stuck on Upload with only a transient snackbar as feedback.
    setCurrentStep(1);
    if (!result) {
      setPreviewFailed(true);
      return;
    }
    setPreviewResult(result);
  }, [selectedFile, branchId, preview]);

  const handleBackFromPreview = useCallback(() => setCurrentStep(0), []);
  const handleNextFromPreview = useCallback(() => setCurrentStep(2), []);
  const handleBackFromConfirm = useCallback(() => setCurrentStep(1), []);

  const startCommit = useCallback(
    async (skipInvalidRows: boolean) => {
      if (!previewResult) return;
      setShowValidOnlyConfirm(false);
      const actorTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const ok = await commit(previewResult.importId, { skipInvalidRows, actorTimezone });
      if (ok) setCurrentStep(3);
    },
    [previewResult, commit],
  );

  const handleStartImport = useCallback(() => {
    if (!previewResult) return;
    if (previewResult.summary.withErrors > 0) {
      setShowValidOnlyConfirm(true);
      return;
    }
    void startCommit(false);
  }, [previewResult, startCommit]);

  return (
    <div>
      <PageHeader title="Import Appointments" />

      <div className="mb-4 flex items-center justify-between">
        <Link
          to="/appointments"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)] hover:underline"
        >
          <i className="mdi mdi-arrow-left" aria-hidden="true" />
          Back to Appointments
        </Link>
        <a
          href="/templates/appointments-import-template.csv"
          download="appointments-import-template.csv"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)] hover:underline"
        >
          <i className="mdi mdi-download" aria-hidden="true" />
          Download template
        </a>
      </div>

      <ImportWizard steps={STEPS} currentStep={currentStep}>
        {currentStep === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Upload File</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Upload a CSV or Excel file with appointment data. Download the template above for the expected columns.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {isGlobalRole && (
                <FormField label="Agency" required>
                  <SelectInput
                    value={selectedTenantId}
                    onChange={setSelectedTenantId}
                    options={tenantOptions}
                    placeholder="Select agency"
                    aria-label="Agency"
                  />
                </FormField>
              )}
              <FormField
                label="Branch"
                required
                hint={requiresTenantSelection ? 'Select an agency before choosing a branch.' : undefined}
              >
                <SelectInput
                  value={branchId}
                  onChange={setBranchId}
                  options={branchOptions}
                  placeholder="Select branch"
                  disabled={requiresTenantSelection}
                  aria-label="Branch"
                />
              </FormField>
            </div>

            <FileUploadStep
              onFileSelect={handleFileSelect}
              acceptedTypes={['.csv', '.xlsx']}
              maxSizeMB={5}
              selectedFile={selectedFile}
              onRemove={handleRemoveFile}
            />
            <div className="flex justify-end pt-2">
              <Button onClick={runPreview} disabled={!canPreview} loading={isPreviewing}>
                Next
              </Button>
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">Preview Data</h3>

            {isPreviewing && <LoadingState variant="card" rows={4} />}

            {!isPreviewing && previewFailed && (
              <ErrorState
                message="Could not generate a preview"
                detail="Check that the file matches the expected columns and try again."
                onRetry={runPreview}
              />
            )}

            {!isPreviewing && !previewFailed && previewResult && previewResult.summary.importable === 0 && (
              <EmptyState
                icon="mdi-file-alert-outline"
                title="No rows can be imported"
                description="Every row in this file has an error. Fix the file and upload it again."
              />
            )}

            {!isPreviewing && !previewFailed && previewResult && (
              <AppointmentImportPreview rows={previewResult.rows} summary={previewResult.summary} />
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="outlined" onClick={handleBackFromPreview}>
                Back
              </Button>
              <Button
                onClick={handleNextFromPreview}
                disabled={!previewResult || previewResult.summary.importable === 0}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {currentStep === 2 && previewResult && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Import Summary</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{previewResult.summary.totalRows}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">Total Rows</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                <p className="text-2xl font-bold text-[var(--color-success)]">{previewResult.summary.importable}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">Importable</p>
              </div>
              <div className={`rounded-lg border p-4 text-center ${previewResult.summary.withErrors > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                <p className={`text-2xl font-bold ${previewResult.summary.withErrors > 0 ? 'text-[var(--color-error)]' : 'text-[var(--color-text-muted)]'}`}>
                  {previewResult.summary.withErrors}
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">Error Rows</p>
              </div>
            </div>

            {previewResult.summary.withErrors > 0 && (
              <div className="rounded-md bg-red-50 p-3" role="alert">
                <p className="text-sm text-[var(--color-error)]">
                  {previewResult.summary.withErrors} row(s) have errors and will be skipped unless you choose to import the valid rows only.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
              <Button variant="outlined" onClick={handleBackFromConfirm} disabled={isCommitting}>
                Back
              </Button>
              <Button
                onClick={handleStartImport}
                disabled={previewResult.summary.importable === 0 || isCommitting}
                loading={isCommitting}
              >
                Start Import
              </Button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            {!importStatus && <LoadingState variant="card" rows={3} />}
            {importStatus && (
              <>
                <ProgressStep
                  status={importStatus.status === 'PREVIEW' ? 'PROCESSING' : importStatus.status}
                  progress={
                    importStatus.status === 'COMPLETED' || importStatus.status === 'FAILED'
                      ? 100
                      : Math.round(((importStatus.successCount + importStatus.errorCount) / Math.max(importStatus.totalRows, 1)) * 100)
                  }
                  successCount={importStatus.successCount}
                  errorCount={importStatus.errorCount}
                  errors={importStatus.results
                    .filter((r) => r.status === 'error')
                    .map((r) => ({ row: r.rowNumber, message: r.message ?? 'Unknown error' }))}
                />
                {(importStatus.status === 'COMPLETED' || importStatus.status === 'FAILED') && (
                  <div className="flex flex-col items-center gap-3 pt-4">
                    {importStatus.errorCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void downloadErrorsCsv(importStatus.id, showError)}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)] hover:underline"
                      >
                        <i className="mdi mdi-download" aria-hidden="true" />
                        Download errors.csv
                      </button>
                    )}
                    <Link
                      to="/appointments"
                      className="rounded bg-[var(--color-primary)] px-6 py-2 text-sm font-bold text-white transition-colors hover:opacity-90"
                    >
                      Back to Appointments
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </ImportWizard>

      <ConfirmDialog
        open={showValidOnlyConfirm}
        onClose={() => setShowValidOnlyConfirm(false)}
        onConfirm={() => void startCommit(true)}
        title="Import only the valid rows?"
        message={`${previewResult?.summary.withErrors ?? 0} row(s) have errors and will be skipped. The remaining ${previewResult?.summary.importable ?? 0} row(s) will be imported.`}
        confirmLabel="Import"
        variant="warning"
        loading={isCommitting}
      />
    </div>
  );
}
