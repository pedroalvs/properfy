export interface PropertyImportProps {
  id: string;
  tenantId: string;
  status: string;
  fileKey: string;
  originalFilename: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errorsJson: unknown[] | null;
  previewJson: unknown | null;
  resultsJson: unknown | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class PropertyImportEntity {
  readonly id: string;
  readonly tenantId: string;
  status: string;
  readonly fileKey: string;
  readonly originalFilename: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errorsJson: unknown[] | null;
  previewJson: unknown | null;
  resultsJson: unknown | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(props: PropertyImportProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.status = props.status;
    this.fileKey = props.fileKey;
    this.originalFilename = props.originalFilename;
    this.totalRows = props.totalRows;
    this.successCount = props.successCount;
    this.errorCount = props.errorCount;
    this.errorsJson = props.errorsJson;
    this.previewJson = props.previewJson;
    this.resultsJson = props.resultsJson;
    this.createdByUserId = props.createdByUserId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
