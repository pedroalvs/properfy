import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  IStorageService,
  SignedUploadUrlResult,
  HeadObjectResult,
} from '../domain/storage.service';

export class SupabaseStorageService implements IStorageService {
  constructor(private readonly s3Client: S3Client) {}

  async createSignedUploadUrl(
    bucket: string,
    key: string,
    ttlSeconds: number,
  ): Promise<SignedUploadUrlResult> {
    const command = new PutObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(this.s3Client, command, {
      expiresIn: ttlSeconds,
    });
    return { url, storageKey: key };
  }

  async headObject(bucket: string, key: string): Promise<HeadObjectResult> {
    try {
      const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
      const response = await this.s3Client.send(command);
      return { exists: true, sizeBytes: response.ContentLength ?? 0 };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'NotFound') {
        return { exists: false, sizeBytes: 0 };
      }
      throw error;
    }
  }
}
