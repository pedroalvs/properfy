import type { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IBrandingStorageService, SignedUploadUrlResult, HeadObjectResult } from '../domain/branding-storage.service';

const BUCKET = 'tenant-branding';

export class SupabaseBrandingStorageService implements IBrandingStorageService {
  constructor(
    private readonly s3Client: S3Client,
    private readonly publicUrlBase: string,
  ) {}

  async createSignedUploadUrl(
    key: string,
    contentType: string,
    ttlSeconds: number,
  ): Promise<SignedUploadUrlResult> {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.s3Client, command, { expiresIn: ttlSeconds });
    return { url, storageKey: key };
  }

  getPublicUrl(key: string): string {
    const base = this.publicUrlBase.replace(/\/$/, '');
    return `${base}/${BUCKET}/${key}`;
  }

  async headObject(key: string): Promise<HeadObjectResult> {
    try {
      const command = new HeadObjectCommand({ Bucket: BUCKET, Key: key });
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
