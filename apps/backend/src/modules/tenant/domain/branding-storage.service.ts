export interface SignedUploadUrlResult {
  url: string;
  storageKey: string;
}

export interface IBrandingStorageService {
  createSignedUploadUrl(key: string, contentType: string, ttlSeconds: number): Promise<SignedUploadUrlResult>;
  getPublicUrl(key: string): string;
}
