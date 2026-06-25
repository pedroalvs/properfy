import type { PiiFieldMappingEntity } from './pii-field-mapping.entity';

export interface IPiiFieldMappingRepository {
  findAll(): Promise<PiiFieldMappingEntity[]>;
  findByAction(action: string): Promise<PiiFieldMappingEntity[]>;
  findById(id: string): Promise<PiiFieldMappingEntity | null>;
  save(entity: PiiFieldMappingEntity): Promise<void>;
  update(entity: PiiFieldMappingEntity): Promise<void>;
  delete(id: string): Promise<void>;
}
