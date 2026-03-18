import type { IReportStorageService } from '../domain/report-storage.service';

export class StubReportStorageService implements IReportStorageService {
  private store = new Map<string, Buffer>();

  async upload(key: string, buffer: Buffer, _contentType: string): Promise<void> {
    this.store.set(key, buffer);
  }

  async download(key: string): Promise<Buffer> {
    return this.store.get(key) ?? Buffer.alloc(0);
  }

  async generatePresignedGetUrl(key: string, _ttlSeconds: number): Promise<string> {
    return `https://storage.example.com/signed/${key}?token=stub-token`;
  }

  async deleteObject(key: string): Promise<void> {
    this.store.delete(key);
  }
}
