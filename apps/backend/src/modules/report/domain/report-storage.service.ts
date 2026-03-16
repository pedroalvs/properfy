export interface IReportStorageService {
  upload(key: string, buffer: Buffer, contentType: string): Promise<void>;
  generatePresignedGetUrl(key: string, ttlSeconds: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
