import { useRef, useState } from 'react';
import { api } from '@/services/api';

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

interface AvatarUploaderProps {
  inspectorId: string;
  onUploaded: () => void;
}

export function AvatarUploader({ inspectorId, onUploaded }: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!ALLOWED_MIME.includes(file.type)) {
      setError('Only PNG, JPEG or WebP images are allowed.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('Image must be under 5 MB.');
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      const { data: presignData, error: presignErr } = await api.POST(
        `/v1/inspectors/{inspectorId}/photo/presign` as never,
        { params: { path: { inspectorId } }, body: { mimeType: file.type } } as never,
      );
      if (presignErr || !presignData) throw new Error('Failed to get upload URL');
      // UX-baseline cleanup: backend now wraps the response in
      // `{ data: { uploadUrl, storageKey, expiresAt } }`.
      const { uploadUrl, storageKey } = (presignData as { data: { uploadUrl: string; storageKey: string } }).data;

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!putRes.ok) throw new Error('Upload failed');

      const { error: confirmErr } = await api.POST(
        `/v1/inspectors/{inspectorId}/photo/confirm` as never,
        { params: { path: { inspectorId } }, body: { storageKey } } as never,
      );
      if (confirmErr) throw new Error('Failed to confirm upload');

      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_MIME.join(',')}
        className="hidden"
        aria-label="Upload profile photo"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        aria-label="Change profile photo"
        className="flex h-6 w-6 items-center justify-center rounded-full bg-real-estate text-white shadow-md disabled:opacity-50"
        title={error ?? undefined}
      >
        {isUploading ? (
          <i className="mdi mdi-loading mdi-spin text-xs" aria-hidden="true" />
        ) : (
          <i className="mdi mdi-camera text-xs" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
