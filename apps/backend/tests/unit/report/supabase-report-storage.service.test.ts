import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SupabaseReportStorageService } from '../../../src/modules/report/infrastructure/supabase-report-storage.service';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

describe('SupabaseReportStorageService', () => {
  let s3Client: { send: ReturnType<typeof vi.fn> };
  let service: SupabaseReportStorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    s3Client = { send: vi.fn() };
    service = new SupabaseReportStorageService(
      s3Client as unknown as S3Client,
      'test-bucket',
    );
  });

  describe('upload', () => {
    it('sends PutObjectCommand with correct body and content type', async () => {
      s3Client.send.mockResolvedValue({});
      const buffer = Buffer.from('report-content');

      await service.upload('reports/abc.xlsx', buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      expect(s3Client.send).toHaveBeenCalledWith(expect.any(PutObjectCommand));

      const command = s3Client.send.mock.calls[0][0] as PutObjectCommand;
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'reports/abc.xlsx',
        Body: buffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    });
  });

  describe('generatePresignedGetUrl', () => {
    it('returns signed URL for get object', async () => {
      const mockUrl = 'https://signed-get-url.example.com';
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue(mockUrl);

      const result = await service.generatePresignedGetUrl('reports/abc.xlsx', 900);

      expect(result).toBe(mockUrl);
      expect(getSignedUrl).toHaveBeenCalledWith(
        s3Client,
        expect.any(GetObjectCommand),
        { expiresIn: 900 },
      );

      const command = (getSignedUrl as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as GetObjectCommand;
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'reports/abc.xlsx',
      });
    });
  });

  describe('deleteObject', () => {
    it('sends DeleteObjectCommand with correct key', async () => {
      s3Client.send.mockResolvedValue({});

      await service.deleteObject('reports/abc.xlsx');

      expect(s3Client.send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));

      const command = s3Client.send.mock.calls[0][0] as DeleteObjectCommand;
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'reports/abc.xlsx',
      });
    });
  });
});
