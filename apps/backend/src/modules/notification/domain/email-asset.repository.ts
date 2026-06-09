import type { EmailAssetStatus } from '@properfy/shared';

export interface EmailAssetData {
  id: string;
  tenantId: string | null;
  placeholderKey: string;
  storageKey: string;
  publicUrl: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  status: EmailAssetStatus;
  everSent: boolean;
  uploadedByUserId: string;
  createdAt: Date;
}

export interface CreateEmailAssetData {
  id: string;
  tenantId: string | null;
  placeholderKey: string;
  storageKey: string;
  publicUrl: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  uploadedByUserId: string;
}

export interface IEmailAssetRepository {
  create(data: CreateEmailAssetData): Promise<EmailAssetData>;
  findById(id: string): Promise<EmailAssetData | null>;
  findByPlaceholderKey(tenantId: string | null, placeholderKey: string): Promise<EmailAssetData | null>;
  findAll(tenantId: string | null): Promise<EmailAssetData[]>;
  updateStatus(
    id: string,
    status: EmailAssetStatus,
    verifiedData?: { contentType: string; sizeBytes: number; width: number | null; height: number | null },
  ): Promise<EmailAssetData>;
  markEverSent(ids: string[]): Promise<void>;
  hardDelete(id: string): Promise<void>;
}
