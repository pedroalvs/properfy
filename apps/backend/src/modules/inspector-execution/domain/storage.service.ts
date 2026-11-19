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
  /**
   * Read up to `maxBytes` from the start of an object. Used by the property-file
   * confirm step (F10) to sniff the real MIME with `file-type` — the presign/
   * confirm flow never holds the uploaded buffer server-side, and `headObject`
   * returns only metadata. Implementations SHOULD request a byte range so only a
   * small prefix is transferred.
   */
  getObjectBytes(bucket: string, key: string, maxBytes: number): Promise<Buffer>;
}
