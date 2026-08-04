import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useTenantLogo } from '../hooks/useTenantLogo';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE_MB = 2;

interface EmailLogoSectionProps {
  tenantId: string;
  /** Current logo public URL from tenant settings, null when none uploaded. */
  logoUrl: string | null;
  /** Called after a successful upload or removal so the page refetches. */
  onChanged: () => void;
}

export function EmailLogoSection({ tenantId, logoUrl, onChanged }: EmailLogoSectionProps) {
  const { showError } = useSnackbar();
  const { uploadLogo, removeLogo, isUploading, isRemoving } = useTenantLogo(tenantId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  // Object URLs leak the underlying blob until revoked.
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const handlePickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      // Allow re-selecting the same file after a cancel.
      event.target.value = '';
      if (!file) return;
      if (!ACCEPTED_TYPES.includes(file.type)) {
        showError('Logo must be a PNG, JPEG or WebP image');
        return;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        showError(`Logo must be ${MAX_SIZE_MB} MB or smaller`);
        return;
      }
      setSelectedFile(file);
    },
    [showError],
  );

  const handleCancelSelection = useCallback(() => {
    setSelectedFile(null);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    const ok = await uploadLogo(selectedFile);
    if (ok) {
      setSelectedFile(null);
      onChanged();
    }
  }, [selectedFile, uploadLogo, onChanged]);

  const handleConfirmRemove = useCallback(async () => {
    const ok = await removeLogo();
    setShowRemoveConfirm(false);
    if (ok) onChanged();
  }, [removeLogo, onChanged]);

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <FormSection title="Email Logo">
        <p className="mb-4 text-sm text-text-secondary">
          This logo is available in email templates through the{' '}
          <code className="rounded bg-app-bg px-1 py-0.5 text-xs">{'{{agencyLogoUrl}}'}</code>{' '}
          variable. Wrap it in{' '}
          <code className="rounded bg-app-bg px-1 py-0.5 text-xs">
            {'{{#if agencyLogoUrl}}…{{/if}}'}
          </code>{' '}
          so agencies without a logo render nothing instead of a broken image.
        </p>

        <div className="flex flex-wrap items-start gap-6">
          <div>
            <span className="mb-2 block text-sm font-bold text-text-secondary">
              {selectedFile ? 'Preview' : 'Current logo'}
            </span>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Selected logo preview"
                className="max-h-32 max-w-xs rounded border border-black/10 bg-white object-contain p-2"
              />
            ) : logoUrl ? (
              <img
                src={logoUrl}
                alt="Current agency logo"
                className="max-h-32 max-w-xs rounded border border-black/10 bg-white object-contain p-2"
              />
            ) : (
              <p className="text-sm text-text-muted">No logo uploaded yet.</p>
            )}
            {selectedFile && (
              <p className="mt-1 text-xs text-text-muted">{selectedFile.name}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              className="hidden"
              data-testid="logo-file-input"
              onChange={handleFileChange}
            />
            {selectedFile ? (
              <>
                <Button onClick={handleUpload} loading={isUploading}>
                  Upload
                </Button>
                <Button variant="secondary" onClick={handleCancelSelection} disabled={isUploading}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button onClick={handlePickFile}>
                  {logoUrl ? 'Replace logo' : 'Choose image'}
                </Button>
                {logoUrl && (
                  <Button
                    variant="secondary"
                    onClick={() => setShowRemoveConfirm(true)}
                    disabled={isRemoving}
                  >
                    Remove
                  </Button>
                )}
              </>
            )}
            <p className="text-xs text-text-muted">PNG, JPEG or WebP, up to {MAX_SIZE_MB} MB.</p>
          </div>
        </div>
      </FormSection>

      <ConfirmDialog
        open={showRemoveConfirm}
        title="Remove Logo"
        message="Remove this agency's email logo? Emails using {{agencyLogoUrl}} will render without it."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        loading={isRemoving}
        onConfirm={handleConfirmRemove}
        onClose={() => setShowRemoveConfirm(false)}
      />
    </div>
  );
}
