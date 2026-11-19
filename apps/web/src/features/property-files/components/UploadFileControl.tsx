import { useRef, type ChangeEvent } from 'react';
import type { PropertyFileType } from '@properfy/shared';
import { Button } from '@/components/ui';
import { usePropertyFileUpload } from '../hooks/usePropertyFileUpload';

export interface UploadFileControlProps {
  type: PropertyFileType;
  propertyId: string;
  appointmentId?: string;
  /** `accept` hint for the file picker (server is the authority — C.A5). */
  accept: string;
  label?: string;
  onUploaded?: () => void;
}

/**
 * A hidden `<input type="file">` plus a trigger button that uploads one file via
 * the presign → PUT → confirm flow (F10 C.2). The `accept` hint narrows the
 * picker; the server validates magic bytes + size and the error is surfaced by
 * the hook (C.A5 / D16). Mirrors the inspector `DocumentUploadField` pattern.
 */
export function UploadFileControl({
  type,
  propertyId,
  appointmentId,
  accept,
  label = 'Upload',
  onUploaded,
}: UploadFileControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = usePropertyFileUpload();

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again re-fires onChange.
    e.target.value = '';
    if (!file) return;
    const ok = await upload({ file, type, propertyId, appointmentId });
    if (ok) onUploaded?.();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleChange}
      />
      <Button
        variant="secondary"
        onClick={() => inputRef.current?.click()}
        loading={isUploading}
        disabled={isUploading}
      >
        <i className="mdi mdi-upload mr-1" aria-hidden="true" />
        {label}
      </Button>
    </>
  );
}
