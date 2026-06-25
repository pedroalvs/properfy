import { BaseEntity } from '../../../shared/domain/entity';

export interface InspectionAssetProps {
  id: string;
  appointmentId: string;
  inspectionExecutionId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number | null;
  kind: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE';
  status: 'PENDING' | 'UPLOADED' | 'UPLOAD_FAILED';
  uploadedBy: string;
  uploadExpiresAt: Date | null;
  originalFilename: string | null;
  createdAt: Date;
}

export class InspectionAssetEntity extends BaseEntity {
  readonly appointmentId: string;
  readonly inspectionExecutionId: string;
  readonly storageKey: string;
  readonly mimeType: string;
  sizeBytes: number | null;
  readonly kind: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE';
  status: 'PENDING' | 'UPLOADED' | 'UPLOAD_FAILED';
  readonly uploadedBy: string;
  readonly uploadExpiresAt: Date | null;
  readonly originalFilename: string | null;

  constructor(props: InspectionAssetProps) {
    super(props.id, props.createdAt, props.createdAt); // assets have no updatedAt, use createdAt
    this.appointmentId = props.appointmentId;
    this.inspectionExecutionId = props.inspectionExecutionId;
    this.storageKey = props.storageKey;
    this.mimeType = props.mimeType;
    this.sizeBytes = props.sizeBytes;
    this.kind = props.kind;
    this.status = props.status;
    this.uploadedBy = props.uploadedBy;
    this.uploadExpiresAt = props.uploadExpiresAt;
    this.originalFilename = props.originalFilename;
  }

  isUploaded(): boolean {
    return this.status === 'UPLOADED';
  }

  isPending(): boolean {
    return this.status === 'PENDING';
  }

  isExpired(now: Date): boolean {
    if (!this.uploadExpiresAt) return false;
    return now > this.uploadExpiresAt;
  }

  markUploaded(sizeBytes: number): void {
    this.status = 'UPLOADED';
    this.sizeBytes = sizeBytes;
  }

  markFailed(): void {
    this.status = 'UPLOAD_FAILED';
  }
}
