import type { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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
    contentType: string,
  ): Promise<SignedUploadUrlResult> {
    const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    const url = await getSignedUrl(this.s3Client, command, { expiresIn: ttlSeconds });
    return { url, storageKey: key };
  }

  async headObject(bucket: string, key: string): Promise<HeadObjectResult> {
    try {
      const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
      const response = await this.s3Client.send(command);
      return { exists: true, sizeBytes: response.ContentLength ?? 0 };
    } catch (error: unknown) {
      // A missing object can surface either as the SDK's 'NotFound' error name or,
      // depending on the S3 gateway (Supabase), as a generic error carrying a 404
      // status code. Treat both as "absent"; rethrow everything else (a 403/500
      // is a real failure and must not be masked as a missing object).
      const httpStatusCode =
        typeof error === 'object' && error !== null
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
          : undefined;
      const isNotFound =
        (error instanceof Error && error.name === 'NotFound') || httpStatusCode === 404;
      if (isNotFound) {
        return { exists: false, sizeBytes: 0 };
      }
      throw error;
    }
  }

  async createSignedDownloadUrl(bucket: string, key: string, ttlSeconds: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.s3Client, command, { expiresIn: ttlSeconds });
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
    await this.s3Client.send(command);
  }
}
