import type { AssetUploadState } from '../types';

interface AssetThumbnailProps {
  asset: AssetUploadState;
  onRetry?: () => void;
  onDelete: () => void;
}

export function AssetThumbnail({ asset, onRetry, onDelete }: AssetThumbnailProps) {
  return (
    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg" data-testid={`asset-${asset.localId}`}>
      <img
        src={asset.blobUrl}
        alt={asset.filename}
        className="h-full w-full object-cover"
      />

      {asset.status === 'uploading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="text-xs font-bold text-white" role="status">
            {asset.progress}%
          </div>
        </div>
      )}

      {asset.status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-error/40">
          {onRetry && (
            <button onClick={onRetry} className="text-white" aria-label="Retry upload">
              <i className="mdi mdi-refresh text-xl" />
            </button>
          )}
        </div>
      )}

      {asset.status === 'done' && (
        <div className="absolute right-1 top-1">
          <i className="mdi mdi-check-circle text-success" aria-hidden="true" />
        </div>
      )}

      <button
        onClick={onDelete}
        className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
        aria-label={`Remove ${asset.filename}`}
      >
        <i className="mdi mdi-close text-xs" />
      </button>
    </div>
  );
}
