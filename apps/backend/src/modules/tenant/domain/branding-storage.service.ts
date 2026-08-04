export interface IBrandingStorageService {
  upload(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}
