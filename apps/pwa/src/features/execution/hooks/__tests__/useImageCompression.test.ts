import { compressImage } from '../useImageCompression';

vi.mock('heic2any', () => ({
  default: vi.fn(),
}));

import heic2any from 'heic2any';

const mockedHeic2any = vi.mocked(heic2any);

// Mock browser APIs not available in jsdom
const originalImage = globalThis.Image;

beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  globalThis.URL.revokeObjectURL = vi.fn();

  globalThis.Image = class MockImage {
    width = 100;
    height = 100;
    onload: (() => void) | null = null;
    onerror: ((err: unknown) => void) | null = null;

    set src(_: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  } as unknown as typeof Image;

  mockedHeic2any.mockReset();
});

afterEach(() => {
  globalThis.Image = originalImage;
});

describe('compressImage', () => {
  it('converts HEIC files to JPEG via heic2any', async () => {
    const heicFile = new File(['data'], 'photo.heic', { type: 'image/heic' });
    const convertedBlob = new Blob(['jpeg-data'], { type: 'image/jpeg' });
    mockedHeic2any.mockResolvedValue(convertedBlob);

    const result = await compressImage(heicFile);
    expect(mockedHeic2any).toHaveBeenCalledWith({
      blob: heicFile,
      toType: 'image/jpeg',
      quality: 0.85,
    });
    expect(result.name).toBe('photo.jpg');
    expect(result.type).toBe('image/jpeg');
  });

  it('converts .heif files to JPEG via heic2any', async () => {
    const heifFile = new File(['data'], 'photo.heif', { type: 'image/heif' });
    const convertedBlob = new Blob(['jpeg-data'], { type: 'image/jpeg' });
    mockedHeic2any.mockResolvedValue(convertedBlob);

    const result = await compressImage(heifFile);
    expect(mockedHeic2any).toHaveBeenCalled();
    expect(result.name).toBe('photo.jpg');
  });

  it('falls back to original file when heic2any conversion fails', async () => {
    const heicFile = new File(['data'], 'photo.heic', { type: 'image/heic' });
    mockedHeic2any.mockRejectedValue(new Error('conversion failed'));

    const result = await compressImage(heicFile);
    expect(result).toBe(heicFile);
  });

  it('handles heic2any returning array of blobs', async () => {
    const heicFile = new File(['data'], 'photo.HEIC', { type: 'application/octet-stream' });
    const blob1 = new Blob(['jpeg-data-1'], { type: 'image/jpeg' });
    const blob2 = new Blob(['jpeg-data-2'], { type: 'image/jpeg' });
    mockedHeic2any.mockResolvedValue([blob1, blob2]);

    const result = await compressImage(heicFile);
    expect(result.name).toBe('photo.jpg');
    expect(result.type).toBe('image/jpeg');
  });

  it('returns original file when canvas context is unavailable (jsdom)', async () => {
    // In jsdom, canvas.getContext('2d') returns null
    const pngFile = new File(['data'], 'image.png', { type: 'image/png' });
    const result = await compressImage(pngFile);
    expect(result).toBe(pngFile);
  });

  it('returns original JPEG file when within dimension limit', async () => {
    const jpegFile = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const result = await compressImage(jpegFile);
    expect(result).toBe(jpegFile);
  });
});
