import { render, screen } from '@testing-library/react';
import { AssetThumbnail } from '../AssetThumbnail';
import type { AssetUploadState } from '../../types';

const baseAsset: AssetUploadState = {
  localId: 'asset-1',
  assetId: null,
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
  blobUrl: 'blob:photo',
  status: 'pending',
  progress: 0,
  uploadUrl: null,
  storageKey: null,
};

describe('AssetThumbnail', () => {
  it('shows a local-saved indicator for pending assets', () => {
    render(<AssetThumbnail asset={baseAsset} onDelete={vi.fn()} />);

    expect(screen.getByText('Saved locally')).toBeInTheDocument();
  });

  it('shows sync failed label for error assets', () => {
    render(
      <AssetThumbnail
        asset={{ ...baseAsset, status: 'error' }}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Sync failed')).toBeInTheDocument();
  });

  it('renders <img> for image/jpeg content type', () => {
    render(
      <AssetThumbnail
        asset={{ ...baseAsset, contentType: 'image/jpeg', blobUrl: 'blob:photo', filename: 'photo.jpg' }}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('img', { name: 'photo.jpg' })).toBeInTheDocument();
  });

  it('renders <img> for image/png content type', () => {
    render(
      <AssetThumbnail
        asset={{ ...baseAsset, contentType: 'image/png', blobUrl: 'blob:png', filename: 'img.png' }}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('img', { name: 'img.png' })).toBeInTheDocument();
  });

  it('renders file-document icon (no <img>) for non-image MIME types', () => {
    render(
      <AssetThumbnail
        asset={{ ...baseAsset, contentType: 'application/pdf', filename: 'report.pdf' }}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole('img', { name: 'report.pdf' })).not.toBeInTheDocument();
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
  });

  it('renders filename label for non-image assets', () => {
    render(
      <AssetThumbnail
        asset={{ ...baseAsset, contentType: 'video/mp4', filename: 'clip.mp4' }}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
  });
});
