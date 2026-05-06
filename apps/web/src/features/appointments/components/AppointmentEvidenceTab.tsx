import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useAppointmentAssets, type InspectionAsset } from '../hooks/useAppointmentAssets';
import { useAssetDownload } from '../hooks/useAssetDownload';
import { useAssetThumbnail } from '../hooks/useAssetThumbnail';

interface AppointmentEvidenceTabProps {
  appointmentId: string;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

interface AssetRowProps {
  asset: InspectionAsset;
  appointmentId: string;
  onDownload: () => void;
  isDownloading: boolean;
}

function AssetRow({ asset, appointmentId, onDownload, isDownloading }: AssetRowProps) {
  const isImage = asset.mimeType.startsWith('image/');
  const displayName = asset.originalFilename ?? asset.storageKey.split('/').pop() ?? asset.id;
  const { signedUrl, isLoading: thumbnailLoading } = useAssetThumbnail(
    appointmentId,
    asset.id,
    isImage,
  );

  return (
    <div className="flex items-center gap-4 rounded border border-black/10 bg-app-bg px-4 py-3">
      {/* Thumbnail or icon */}
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-black/5">
        {isImage ? (
          thumbnailLoading || !signedUrl ? (
            <i className="mdi mdi-image text-3xl text-text-muted" aria-hidden="true" />
          ) : (
            <img
              src={signedUrl}
              alt={displayName}
              className="h-14 w-14 object-cover rounded"
            />
          )
        ) : (
          <i className="mdi mdi-file-document text-3xl text-text-muted" aria-hidden="true" />
        )}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary" title={displayName}>
          {displayName}
        </p>
        <p className="mt-0.5 text-xs text-text-secondary">
          {asset.mimeType} · {formatBytes(asset.sizeBytes)}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">{formatDate(asset.createdAt)}</p>
      </div>

      {/* Download */}
      <button
        onClick={onDownload}
        disabled={isDownloading}
        className="shrink-0 rounded p-1.5 text-text-secondary hover:bg-black/5 disabled:opacity-50"
        aria-label={`Download ${displayName}`}
      >
        {isDownloading ? (
          <i className="mdi mdi-loading mdi-spin text-lg" aria-hidden="true" />
        ) : (
          <i className="mdi mdi-download text-lg" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export function AppointmentEvidenceTab({ appointmentId }: AppointmentEvidenceTabProps) {
  const { assets, isLoading, isError, refetch } = useAppointmentAssets(appointmentId);
  const { download, downloadingId } = useAssetDownload();

  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState message="Failed to load evidence" onRetry={refetch} />;

  if (assets.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-text-muted">
        No evidence uploaded for this appointment.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {assets.map((asset) => (
        <AssetRow
          key={asset.id}
          asset={asset}
          appointmentId={appointmentId}
          onDownload={() => download(appointmentId, asset.id)}
          isDownloading={downloadingId === asset.id}
        />
      ))}
    </div>
  );
}
