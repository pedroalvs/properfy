/** Presigned PUT URL response for direct-to-storage upload. */
export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
}

/**
 * Port for interacting with the public email-assets storage bucket.
 * Mirrors the existing IStorageService pattern extended with public-URL awareness.
 */
export interface IEmailAssetStorageService {
  /** Returns a presigned PUT URL for the client to upload directly. */
  presignUpload(storageKey: string, contentType: string): Promise<PresignedUploadResult>;

  /** Checks that the object at storageKey exists in the bucket. */
  objectExists(storageKey: string): Promise<boolean>;

  /** Returns the raw bytes of the stored object for content verification. */
  getObjectBytes(storageKey: string): Promise<Buffer>;

  /** Returns the stable public URL for the stored object. */
  getPublicUrl(storageKey: string): string;

  /** Deletes the object permanently from storage. */
  deleteObject(storageKey: string): Promise<void>;
}
