import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  ImportWizard,
  FileUploadStep,
  PreviewStep,
  ConfirmStep,
  ProgressStep,
} from '@/components/import';
import { useAppointmentImport } from '../hooks/useAppointmentImport';

const STEPS = ['Upload', 'Preview', 'Confirm', 'Progress'];

const EXPECTED_COLUMNS = [
  'propertyCode',
  'scheduledDate',
  'timeSlot',
  'tenantName',
  'tenantEmail',
  'tenantPhone',
  'serviceTypeCode',
  'notes',
];

interface ParsedData {
  columns: string[];
  rows: Record<string, string>[];
  errors: { row: number; column: string; message: string }[];
}

function parseCSV(content: string): ParsedData {
  const lines = content.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    return { columns: [], rows: [], errors: [] };
  }

  const headerLine = lines[0]!;
  const columns = headerLine.split(',').map((col) => col.trim());
  const rows: Record<string, string>[] = [];
  const errors: { row: number; column: string; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]!.split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    columns.forEach((col, idx) => {
      row[col] = values[idx] ?? '';
    });
    rows.push(row);

    // Validate required fields against the backend import worker contract.
    const rowNumber = i;
    for (const requiredCol of ['propertyCode', 'scheduledDate', 'timeSlot', 'tenantName']) {
      if (columns.includes(requiredCol) && !row[requiredCol]) {
        errors.push({
          row: rowNumber,
          column: requiredCol,
          message: `${requiredCol} is required`,
        });
      }
    }
  }

  return { columns, rows, errors };
}

export function AppointmentImportPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);

  const { upload, isUploading, importStatus } = useAppointmentImport();

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
  }, []);

  const handleNextFromUpload = useCallback(async () => {
    if (!selectedFile) return;

    const text = await selectedFile.text();
    const parsed = parseCSV(text);
    setParsedData(parsed);
    setCurrentStep(1);
  }, [selectedFile]);

  const handleNextFromPreview = useCallback(() => {
    setCurrentStep(2);
  }, []);

  const handleBackFromPreview = useCallback(() => {
    setCurrentStep(0);
  }, []);

  const handleBackFromConfirm = useCallback(() => {
    setCurrentStep(1);
  }, []);

  const handleConfirmImport = useCallback(() => {
    if (!selectedFile) return;
    upload(selectedFile);
    setCurrentStep(3);
  }, [selectedFile, upload]);

  return (
    <div>
      <PageHeader title="Import Appointments" />

      <div className="mb-4">
        <Link
          to="/appointments"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)] hover:underline"
        >
          <i className="mdi mdi-arrow-left" aria-hidden="true" />
          Back to Appointments
        </Link>
      </div>

      <ImportWizard steps={STEPS} currentStep={currentStep}>
        {currentStep === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                Upload File
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Upload a CSV file with appointment data. Expected columns:{' '}
                <span className="font-semibold">
                  {EXPECTED_COLUMNS.join(', ')}
                </span>
              </p>
            </div>
            <FileUploadStep
              onFileSelect={handleFileSelect}
              acceptedTypes={['.csv']}
              maxSizeMB={5}
              selectedFile={selectedFile}
            />
            <div className="flex justify-end pt-2">
              <button
                onClick={handleNextFromUpload}
                disabled={!selectedFile}
                className="rounded bg-[var(--color-real-estate)] px-6 py-2 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {currentStep === 1 && parsedData && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">
              Preview Data
            </h3>
            <PreviewStep
              columns={parsedData.columns}
              rows={parsedData.rows}
              errors={parsedData.errors}
              totalRows={parsedData.rows.length}
            />
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleBackFromPreview}
                className="rounded border border-gray-300 px-6 py-2 text-sm font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleNextFromPreview}
                className="rounded bg-[var(--color-real-estate)] px-6 py-2 text-sm font-bold text-white transition-colors hover:opacity-90"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {currentStep === 2 && parsedData && (
          <ConfirmStep
            totalRows={parsedData.rows.length}
            errorCount={parsedData.errors.length}
            onConfirm={handleConfirmImport}
            onBack={handleBackFromConfirm}
            isSubmitting={isUploading}
          />
        )}

        {currentStep === 3 && importStatus && (
          <div className="space-y-4">
            <ProgressStep
              status={importStatus.status}
              progress={importStatus.progress}
              successCount={importStatus.successCount}
              errorCount={importStatus.errorCount}
              errors={importStatus.errors}
            />
            {(importStatus.status === 'COMPLETED' ||
              importStatus.status === 'FAILED') && (
              <div className="flex justify-center pt-4">
                <Link
                  to="/appointments"
                  className="rounded bg-[var(--color-primary)] px-6 py-2 text-sm font-bold text-white transition-colors hover:opacity-90"
                >
                  Back to Appointments
                </Link>
              </div>
            )}
          </div>
        )}
      </ImportWizard>
    </div>
  );
}
