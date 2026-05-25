export interface SignedUploadUrlResult {
  url: string;
  storageKey: string;
}

export interface HeadObjectResult {
  exists: boolean;
  sizeBytes: number;
}

export interface IBrandingStorageService {
  createSignedUploadUrl(key: string, contentType: string, ttlSeconds: number): Promise<SignedUploadUrlResult>;
  getPublicUrl(key: string): string;
  headObject(key: string): Promise<HeadObjectResult>;
}
