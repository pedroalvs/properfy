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
});
