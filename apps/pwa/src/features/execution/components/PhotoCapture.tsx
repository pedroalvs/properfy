import { useRef, useState } from 'react';

interface PhotoCaptureProps {
  onCapture: (file: File) => void;
  disabled?: boolean;
  count: number;
  maxPhotos?: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function PhotoCapture({ onCapture, disabled, count, maxPhotos = 30 }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sizeWarning, setSizeWarning] = useState('');
  const atLimit = count >= maxPhotos;

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setSizeWarning('');
    const remainingSlots = Math.max(maxPhotos - count, 0);
    if (remainingSlots === 0) {
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    const { compressImage } = await import('../hooks/useImageCompression');
    const skipped: string[] = [];

    for (const file of Array.from(files).slice(0, remainingSlots)) {
      if (file.size > MAX_FILE_SIZE) {
        skipped.push(file.name);
        continue;
      }
      try {
        const compressed = await compressImage(file);
        onCapture(compressed);
      } catch {
        onCapture(file);
      }
    }

    if (skipped.length > 0) {
      setSizeWarning(`${skipped.length} file(s) skipped — exceeds 10 MB limit`);
    }

    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={disabled || atLimit}
          className="flex min-h-touch items-center gap-2 rounded-lg border border-primary bg-primary/5 px-4 text-sm font-semibold text-primary disabled:opacity-40"
          data-testid="photo-capture-button"
        >
          <i className="mdi mdi-camera text-lg" aria-hidden="true" />
          Add Photo
        </button>
        <span className="text-xs text-text-muted">
          {count}/{maxPhotos}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handleChange}
          className="hidden"
          data-testid="photo-input"
        />
      </div>
      {sizeWarning && (
        <p className="mt-1.5 text-xs text-error" role="alert" data-testid="photo-size-warning">
          <i className="mdi mdi-alert-circle mr-1" aria-hidden="true" />
          {sizeWarning}
        </p>
      )}
    </div>
  );
}
