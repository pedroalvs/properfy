import type {
  S3Client} from '@aws-sdk/client-s3';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IReportStorageService } from '../domain/report-storage.service';

export class SupabaseReportStorageService implements IReportStorageService {
  constructor(
    private readonly s3Client: S3Client,
    private readonly bucket: string,
  ) {}

  async upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });
    await this.s3Client.send(command);
  }

  async download(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const response = await this.s3Client.send(command);
    const stream = response.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  async generatePresignedGetUrl(
    key: string,
    ttlSeconds: number,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: ttlSeconds });
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.s3Client.send(command);
  }
}
