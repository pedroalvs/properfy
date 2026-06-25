import type { AuditLegalHoldEntity } from './audit-legal-hold.entity';

export interface IAuditLegalHoldRepository {
  findAllActive(): Promise<AuditLegalHoldEntity[]>;
  findById(id: string): Promise<AuditLegalHoldEntity | null>;
  findByEntity(entityType: string, entityId: string): Promise<AuditLegalHoldEntity[]>;
  save(entity: AuditLegalHoldEntity): Promise<void>;
  update(entity: AuditLegalHoldEntity): Promise<void>;
}
