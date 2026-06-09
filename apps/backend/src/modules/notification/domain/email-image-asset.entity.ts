import type { EmailAssetStatus } from '@properfy/shared';

export interface EmailImageAssetProps {
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

export class EmailImageAssetEntity {
  readonly id: string;
  readonly tenantId: string | null;
  readonly placeholderKey: string;
  readonly storageKey: string;
  readonly publicUrl: string;
  readonly originalFilename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly status: EmailAssetStatus;
  readonly everSent: boolean;
  readonly uploadedByUserId: string;
  readonly createdAt: Date;

  constructor(props: EmailImageAssetProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.placeholderKey = props.placeholderKey;
    this.storageKey = props.storageKey;
    this.publicUrl = props.publicUrl;
    this.originalFilename = props.originalFilename;
    this.contentType = props.contentType;
    this.sizeBytes = props.sizeBytes;
    this.width = props.width;
    this.height = props.height;
    this.status = props.status;
    this.everSent = props.everSent;
    this.uploadedByUserId = props.uploadedByUserId;
    this.createdAt = props.createdAt;
  }

  isVerified(): boolean {
    return this.status === 'VERIFIED';
  }
}
