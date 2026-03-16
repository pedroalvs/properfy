import { describe, it, expect } from 'vitest';
import { AuditLogEntity } from '../../../src/modules/audit/domain/audit-log.entity';

describe('AuditLogEntity', () => {
  const validProps = {
    id: 'audit-1',
    tenantId: 'tenant-1',
    actorType: 'USER' as const,
    actorId: 'user-1',
    entityType: 'Appointment',
    entityId: 'appt-1',
    action: 'appointment.created',
    reason: null,
    beforeJson: null,
    afterJson: { status: 'DRAFT' },
    requestId: 'req-1',
    ipAddress: '127.0.0.1',
    metadataJson: null,
    createdAt: new Date(),
  };

  it('should create an audit log entity with all properties', () => {
    const entity = new AuditLogEntity(validProps);
    expect(entity.id).toBe('audit-1');
    expect(entity.tenantId).toBe('tenant-1');
    expect(entity.actorType).toBe('USER');
    expect(entity.actorId).toBe('user-1');
    expect(entity.entityType).toBe('Appointment');
    expect(entity.entityId).toBe('appt-1');
    expect(entity.action).toBe('appointment.created');
    expect(entity.reason).toBeNull();
    expect(entity.beforeJson).toBeNull();
    expect(entity.afterJson).toEqual({ status: 'DRAFT' });
    expect(entity.requestId).toBe('req-1');
    expect(entity.ipAddress).toBe('127.0.0.1');
    expect(entity.metadataJson).toBeNull();
    expect(entity.createdAt).toBeInstanceOf(Date);
  });

  it('should accept null tenantId for platform-wide actions', () => {
    const entity = new AuditLogEntity({ ...validProps, tenantId: null });
    expect(entity.tenantId).toBeNull();
  });

  it('should accept SYSTEM actor type', () => {
    const entity = new AuditLogEntity({ ...validProps, actorType: 'SYSTEM', actorId: null });
    expect(entity.actorType).toBe('SYSTEM');
    expect(entity.actorId).toBeNull();
  });

  it('should accept ANONYMOUS actor type', () => {
    const entity = new AuditLogEntity({ ...validProps, actorType: 'ANONYMOUS', actorId: null });
    expect(entity.actorType).toBe('ANONYMOUS');
  });

  it('should store before and after JSON', () => {
    const before = { status: 'DRAFT' };
    const after = { status: 'PUBLISHED' };
    const entity = new AuditLogEntity({ ...validProps, beforeJson: before, afterJson: after });
    expect(entity.beforeJson).toEqual(before);
    expect(entity.afterJson).toEqual(after);
  });
});
