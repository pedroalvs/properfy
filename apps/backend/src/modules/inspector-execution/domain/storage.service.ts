export interface SignedUploadUrlResult {
  url: string;
  storageKey: string;
}

export interface HeadObjectResult {
  exists: boolean;
  sizeBytes: number;
}

export interface IStorageService {
  createSignedUploadUrl(bucket: string, key: string, ttlSeconds: number, contentType: string): Promise<SignedUploadUrlResult>;
  headObject(bucket: string, key: string): Promise<HeadObjectResult>;
  createSignedDownloadUrl(bucket: string, key: string, ttlSeconds: number): Promise<string>;
  deleteObject(bucket: string, key: string): Promise<void>;
}
