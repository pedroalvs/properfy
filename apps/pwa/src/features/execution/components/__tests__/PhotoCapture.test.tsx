import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PhotoCapture } from '../PhotoCapture';

const mockCompressImage = vi.fn(async (file: File) => file);

vi.mock('../../hooks/useImageCompression', () => ({
  compressImage: (...args: unknown[]) => mockCompressImage(...args),
}));

describe('PhotoCapture', () => {
  beforeEach(() => {
    mockCompressImage.mockClear();
  });

  it('limits capture to the remaining photo slots', async () => {
    const onCapture = vi.fn();
    render(<PhotoCapture onCapture={onCapture} count={29} maxPhotos={30} />);

    const input = screen.getByTestId('photo-input') as HTMLInputElement;
    const files = [
      new File(['a'], 'photo-1.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'photo-2.jpg', { type: 'image/jpeg' }),
      new File(['c'], 'photo-3.jpg', { type: 'image/jpeg' }),
    ];

    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    expect(mockCompressImage).toHaveBeenCalledTimes(1);
  });
});
