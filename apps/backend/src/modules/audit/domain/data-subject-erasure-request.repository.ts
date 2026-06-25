import type { DataSubjectErasureRequestEntity } from './data-subject-erasure-request.entity';

export interface IDataSubjectErasureRequestRepository {
  findById(id: string): Promise<DataSubjectErasureRequestEntity | null>;
  findAll(page: number, pageSize: number): Promise<DataSubjectErasureRequestEntity[]>;
  count(): Promise<number>;
  save(entity: DataSubjectErasureRequestEntity): Promise<void>;
  update(entity: DataSubjectErasureRequestEntity): Promise<void>;
}
