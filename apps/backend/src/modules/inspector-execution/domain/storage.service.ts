export interface SignedUploadUrlResult {
  url: string;
  storageKey: string;
}

export interface HeadObjectResult {
  exists: boolean;
  sizeBytes: number;
}

export interface IStorageService {
  createSignedUploadUrl(bucket: string, key: string, ttlSeconds: number): Promise<SignedUploadUrlResult>;
  headObject(bucket: string, key: string): Promise<HeadObjectResult>;
}
