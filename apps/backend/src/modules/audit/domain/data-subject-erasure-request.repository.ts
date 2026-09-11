import type { ErasureRequestStatus } from '@properfy/shared';
import type { DataSubjectErasureRequestEntity } from './data-subject-erasure-request.entity';

export interface IDataSubjectErasureRequestRepository {
  findById(id: string): Promise<DataSubjectErasureRequestEntity | null>;
  findAll(page: number, pageSize: number): Promise<DataSubjectErasureRequestEntity[]>;
  count(): Promise<number>;
  save(entity: DataSubjectErasureRequestEntity): Promise<void>;
  update(entity: DataSubjectErasureRequestEntity): Promise<void>;
  /**
   * B1 #435: atomic compare-and-set on `status`. Moves the request to `to`
   * only if its current status is one of `fromStatuses`, in a single
   * `updateMany`. Returns `true` when exactly one row was moved (this caller
   * won the race), `false` when another caller already advanced it. Callers
   * MUST NOT re-execute side effects when this returns `false`.
   */
  transitionStatus(
    id: string,
    fromStatuses: ErasureRequestStatus[],
    to: ErasureRequestStatus,
  ): Promise<boolean>;
}
