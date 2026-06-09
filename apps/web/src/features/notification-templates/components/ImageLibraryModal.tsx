import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useEmailAssets, type EmailAsset } from '../hooks/useEmailAssets';

interface ImageLibraryModalProps {
  open: boolean;
  onClose: () => void;
  onInsert: (placeholderKey: string) => void;
  tenantId?: string | null;
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export function ImageLibraryModal({ open, onClose, onInsert, tenantId }: ImageLibraryModalProps) {
  const { assets, isLoading, fetchAssets, requestUpload, confirmUpload, deleteAsset } = useEmailAssets(tenantId);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailAsset | null>(null);
  const [deleteResult, setDeleteResult] = useState<{ everSent: boolean } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) void fetchAssets();
  }, [open, fetchAssets]);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploadError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError(`Unsupported file type. Allowed: png, jpeg, webp, gif.`);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setUploadError(`File too large (max 5 MB).`);
      return;
    }

    const key = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'image';

    setUploading(true);
    try {
      const presign = await requestUpload({
        placeholderKey: key,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!presign) {
        setUploadError('Could not start upload. The key may already exist.');
        return;
      }

      // Upload directly to storage
      const upload = await fetch(presign.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!upload.ok) {
        setUploadError('Upload to storage failed.');
        return;
      }

      // Confirm with backend (content verification)
      await confirmUpload(presign.id, file);
      await fetchAssets();
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [requestUpload, confirmUpload, fetchAssets]);

  const handleInsert = useCallback((asset: EmailAsset) => {
    onInsert(asset.placeholderKey);
    onClose();
  }, [onInsert, onClose]);

  const handleDeleteRequest = useCallback(async (asset: EmailAsset) => {
    setDeleteTarget(asset);
    // Check everSent to show appropriate warning
    setDeleteResult({ everSent: asset.everSent });
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setShowDeleteConfirm(false);
    await deleteAsset(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, deleteAsset]);

  const deleteMessage = deleteResult?.everSent
    ? 'This image is no longer used in any template, so it can be deleted. However, if this image was already included in emails that have been sent, those emails may no longer display the image correctly after deletion.'
    : 'This image is no longer used in any template, so it can be deleted.';

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Image Library"
        maxWidth="700px"
        actions={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
              loading={uploading}
            >
              Upload Image
            </Button>
          </div>
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          className="hidden"
          onChange={handleFileSelected}
        />

        {uploadError && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{uploadError}</p>
        )}

        {isLoading && (
          <p className="py-8 text-center text-sm text-text-muted">Loading images…</p>
        )}

        {!isLoading && assets.length === 0 && (
          <p className="py-8 text-center text-sm text-text-muted">
            No images yet. Upload your first image above.
          </p>
        )}

        {!isLoading && assets.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {assets.map((asset) => (
              <div key={asset.id} className="group relative rounded border border-[#E0E0E0] bg-white p-2">
                <img
                  src={asset.publicUrl}
                  alt={asset.placeholderKey}
                  className="mb-2 h-24 w-full rounded object-contain"
                />
                <p className="truncate text-xs font-medium text-text-primary">{asset.placeholderKey}</p>
                <p className="text-[10px] text-text-muted">{asset.contentType}</p>
                <div className="mt-2 flex gap-1">
                  <Button
                    variant="primary"
                    onClick={() => handleInsert(asset)}
                    className="flex-1 text-xs"
                  >
                    Insert
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleDeleteRequest(asset)}
                    className="text-xs text-red-600"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete image?"
        message={deleteMessage}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={handleDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
      />
    </>
  );
}
