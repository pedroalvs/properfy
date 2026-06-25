import type { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IEmailAssetStorageService, PresignedUploadResult } from '../domain/email-asset-storage.service';

const PRESIGN_TTL_SECONDS = 300;

/** Public email-assets bucket — mirrors the tenant-branding bucket pattern. */
export class SupabaseEmailAssetStorageService implements IEmailAssetStorageService {
  constructor(
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
    private readonly publicUrlBase: string,
  ) {}

  async presignUpload(storageKey: string, contentType: string): Promise<PresignedUploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: PRESIGN_TTL_SECONDS });
    return { uploadUrl, storageKey, publicUrl: this.getPublicUrl(storageKey) };
  }

  async objectExists(storageKey: string): Promise<boolean> {
    try {
      await this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucketName, Key: storageKey }));
      return true;
    } catch {
      return false;
    }
  }

  async getObjectBytes(storageKey: string): Promise<Buffer> {
    const response = await this.s3Client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: storageKey }),
    );
    const chunks: Uint8Array[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  getPublicUrl(storageKey: string): string {
    const base = this.publicUrlBase.replace(/\/$/, '');
    return `${base}/${this.bucketName}/${storageKey}`;
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: storageKey }));
  }
}
