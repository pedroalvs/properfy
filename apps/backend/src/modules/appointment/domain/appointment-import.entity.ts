export interface AppointmentImportProps {
  id: string;
  tenantId: string;
  /** Set at preview time (operator-selected branch); both preview and
   * commit derive tenant scope from it for AM/OP. */
  branchId: string | null;
  status: string;
  fileKey: string;
  originalFilename: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errorsJson: unknown[] | null;
  /** Cached full row-resolver output (`{ summary, rows }`) from the last
   * preview — a display cache for the status endpoint, never authoritative
   * for commit (the commit worker always re-resolves fresh). */
  previewJson: unknown | null;
  /** Per-row commit outcomes, written incrementally by the commit worker so
   * a crash/retry mid-batch resumes rather than risking a duplicate
   * appointment. */
  resultsJson: unknown | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AppointmentImportEntity {
  readonly id: string;
  readonly tenantId: string;
  branchId: string | null;
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

  constructor(props: AppointmentImportProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.branchId = props.branchId;
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
