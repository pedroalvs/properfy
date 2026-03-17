import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SupabaseStorageService } from '../../../src/modules/inspector-execution/infrastructure/supabase-storage.service';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

describe('SupabaseStorageService', () => {
  let s3Client: { send: ReturnType<typeof vi.fn> };
  let service: SupabaseStorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    s3Client = { send: vi.fn() };
    service = new SupabaseStorageService(s3Client as unknown as S3Client);
  });

  describe('createSignedUploadUrl', () => {
    it('returns signed URL with correct storageKey', async () => {
      const mockUrl = 'https://signed-url.example.com';
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue(mockUrl);

      const result = await service.createSignedUploadUrl(
        'inspections',
        'photos/abc-123.jpg',
        3600,
      );

      expect(result).toEqual({
        url: mockUrl,
        storageKey: 'photos/abc-123.jpg',
      });

      expect(getSignedUrl).toHaveBeenCalledWith(
        s3Client,
        expect.any(PutObjectCommand),
        { expiresIn: 3600 },
      );

      const command = (getSignedUrl as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as PutObjectCommand;
      expect(command.input).toEqual({
        Bucket: 'inspections',
        Key: 'photos/abc-123.jpg',
      });
    });
  });

  describe('headObject', () => {
    it('returns exists true with sizeBytes when object exists', async () => {
      s3Client.send.mockResolvedValue({ ContentLength: 2048 });

      const result = await service.headObject('inspections', 'photos/abc-123.jpg');

      expect(result).toEqual({ exists: true, sizeBytes: 2048 });
      expect(s3Client.send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));

      const command = s3Client.send.mock.calls[0][0] as HeadObjectCommand;
      expect(command.input).toEqual({
        Bucket: 'inspections',
        Key: 'photos/abc-123.jpg',
      });
    });

    it('returns exists false when object not found', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      s3Client.send.mockRejectedValue(notFoundError);

      const result = await service.headObject('inspections', 'photos/missing.jpg');

      expect(result).toEqual({ exists: false, sizeBytes: 0 });
    });

    it('re-throws non-NotFound errors', async () => {
      const internalError = new Error('Internal Server Error');
      internalError.name = 'InternalError';
      s3Client.send.mockRejectedValue(internalError);

      await expect(
        service.headObject('inspections', 'photos/abc-123.jpg'),
      ).rejects.toThrow('Internal Server Error');
    });
  });
});
