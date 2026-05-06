import { useRef } from 'react';

interface DocumentUploadFieldProps {
  label: string;
  currentFileName?: string | null;
  isUploading?: boolean;
  error?: string | null;
  onFile: (file: File) => void;
}

export function DocumentUploadField({
  label,
  currentFileName,
  isUploading,
  error,
  onFile,
}: DocumentUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        {currentFileName && (
          <span className="truncate text-sm text-text-primary" title={currentFileName}>
            <i className="mdi mdi-file-document-outline mr-1 text-text-muted" aria-hidden="true" />
            {currentFileName}
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          aria-label={`Upload ${label}`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) { onFile(file); e.target.value = ''; }
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="inline-flex items-center gap-1.5 rounded border border-primary px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
        >
          {isUploading ? (
            <>
              <i className="mdi mdi-loading mdi-spin text-sm" aria-hidden="true" />
              Uploading…
            </>
          ) : (
            <>
              <i className="mdi mdi-upload text-sm" aria-hidden="true" />
              {currentFileName ? 'Replace' : 'Upload'}
            </>
          )}
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      <p className="text-xs text-text-muted">PDF, JPEG or PNG — max 20 MB</p>
    </div>
  );
}
