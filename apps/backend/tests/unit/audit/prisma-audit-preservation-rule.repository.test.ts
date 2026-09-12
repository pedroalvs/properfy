import { describe, it, expect, vi } from 'vitest';
import { PrismaAuditPreservationRuleRepository } from '../../../src/modules/audit/infrastructure/prisma-audit-preservation-rule.repository';
import { AuditPreservationRuleEntity } from '../../../src/modules/audit/domain/audit-preservation-rule.entity';

describe('B7 #446: PrismaAuditPreservationRuleRepository.update persists every mutable field', () => {
  it('writes rule_type / entity_type / entity_id / tenant_id, not just name/is_active', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = { auditPreservationRule: { update } } as any;
    const repo = new PrismaAuditPreservationRuleRepository(prisma);

    const entity = new AuditPreservationRuleEntity({
      id: 'rule-1',
      name: 'renamed',
      ruleType: 'CROSS_CHECK',
      entityType: 'Property',
      entityId: 'prop-9',
      tenantId: 'tenant-7',
      isActive: true,
      createdByUserId: 'am-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await repo.update(entity);

    expect(update).toHaveBeenCalledTimes(1);
    const { where, data } = update.mock.calls[0][0];
    expect(where).toEqual({ id: 'rule-1' });
    // snake_case per this repo's Prisma client
    expect(data).toMatchObject({
      name: 'renamed',
      rule_type: 'CROSS_CHECK',
      entity_type: 'Property',
      entity_id: 'prop-9',
      tenant_id: 'tenant-7',
      is_active: true,
    });
  });
});
