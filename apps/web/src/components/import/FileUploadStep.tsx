import { useState, useCallback, useRef, type DragEvent } from 'react';

interface FileUploadStepProps {
  onFileSelect: (file: File) => void;
  acceptedTypes: string[];
  maxSizeMB: number;
  selectedFile: File | null;
  /** Optional — omit to keep the staged-file display read-only (e.g. property import). */
  onRemove?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAcceptedExtensions(types: string[]): string {
  return types.map((t) => t.replace(/^\./, '').toUpperCase()).join(', ');
}

export function FileUploadStep({
  onFileSelect,
  acceptedTypes,
  maxSizeMB,
  selectedFile,
  onRemove,
}: FileUploadStepProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = useCallback(
    (file: File) => {
      setError(null);

      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!acceptedTypes.includes(extension)) {
        setError(
          `Invalid file type. Accepted types: ${getAcceptedExtensions(acceptedTypes)}`,
        );
        return;
      }

      const maxBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        setError(`File is too large. Maximum size: ${maxSizeMB}MB`);
        return;
      }

      onFileSelect(file);
    },
    [acceptedTypes, maxSizeMB, onFileSelect],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndSelect(file);
    },
    [validateAndSelect],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndSelect(file);
    },
    [validateAndSelect],
  );

  const handleBrowseClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div className="space-y-4">
      <div
        data-testid="drop-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
          isDragOver
            ? 'border-[var(--color-primary)] bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
        }`}
        onClick={handleBrowseClick}
        role="button"
        tabIndex={0}
        aria-label="Drop zone for file upload"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleBrowseClick();
          }
        }}
      >
        <i
          className="mdi mdi-cloud-upload text-5xl text-[var(--color-text-muted)]"
          aria-hidden="true"
        />
        <p className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">
          Drag and drop your file here
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          or click to browse
        </p>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          {`Accepted: ${getAcceptedExtensions(acceptedTypes)} (max ${maxSizeMB}MB)`}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={acceptedTypes.join(',')}
          onChange={handleInputChange}
          className="hidden"
          data-testid="file-input"
          aria-label="File upload input"
        />
      </div>

      {selectedFile && (
        <div
          data-testid="selected-file-info"
          className="flex items-center gap-3 rounded-md bg-green-50 p-3"
        >
          <i
            className="mdi mdi-file-check text-xl text-[var(--color-success)]"
            aria-hidden="true"
          />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {selectedFile.name}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {formatFileSize(selectedFile.size)}
            </p>
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove selected file"
              className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-red-50 hover:text-[var(--color-error)]"
            >
              <i className="mdi mdi-close text-lg" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {error && (
        <div
          data-testid="file-upload-error"
          className="flex items-center gap-2 rounded-md bg-red-50 p-3"
          role="alert"
        >
          <i
            className="mdi mdi-alert-circle text-lg text-[var(--color-error)]"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--color-error)]">{error}</p>
        </div>
      )}
    </div>
  );
}
