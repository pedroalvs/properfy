import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { ListRetentionCategoriesUseCase } from '../../../src/modules/audit/application/use-cases/list-retention-categories.use-case';
import { ListPreservationRulesUseCase } from '../../../src/modules/audit/application/use-cases/list-preservation-rules.use-case';
import { ListPiiFieldMappingsUseCase } from '../../../src/modules/audit/application/use-cases/list-pii-field-mappings.use-case';
import { DeletePreservationRuleUseCase } from '../../../src/modules/audit/application/use-cases/delete-preservation-rule.use-case';
import {
  RetentionPolicyForbiddenError,
  PreservationRuleNotFoundError,
} from '../../../src/modules/audit/domain/audit.errors';
import { AuditPreservationRuleEntity } from '../../../src/modules/audit/domain/audit-preservation-rule.entity';

function actor(role: string): AuthContext {
  return { userId: 'u-1', tenantId: role === 'AM' ? null : 't1', role, email: 'x@example.com' } as unknown as AuthContext;
}

function makeRule(): AuditPreservationRuleEntity {
  return new AuditPreservationRuleEntity({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'rule-1',
    ruleType: 'LEGAL_HOLD',
    entityType: 'Appointment',
    entityId: 'appt-1',
    tenantId: null,
    isActive: true,
    createdByUserId: 'am-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('B6 #413 read use cases enforce the AM-only write-path gate', () => {
  it('ListRetentionCategoriesUseCase: 403 for OP, data for AM', async () => {
    const repo = { findAll: vi.fn().mockResolvedValue([{ id: 'c1' }]), findByName: vi.fn(), save: vi.fn(), update: vi.fn() };
    const useCase = new ListRetentionCategoriesUseCase(repo as any);

    await expect(useCase.execute({ actor: actor('OP') })).rejects.toBeInstanceOf(RetentionPolicyForbiddenError);
    expect(repo.findAll).not.toHaveBeenCalled();

    const result = await useCase.execute({ actor: actor('AM') });
    expect(result).toHaveLength(1);
    expect(repo.findAll).toHaveBeenCalledTimes(1);
  });

  it('ListPreservationRulesUseCase: 403 for CL_ADMIN, findAllActive for AM', async () => {
    const repo = { findAllActive: vi.fn().mockResolvedValue([makeRule()]), findById: vi.fn(), findByType: vi.fn(), save: vi.fn(), update: vi.fn(), softDelete: vi.fn() };
    const useCase = new ListPreservationRulesUseCase(repo as any);

    await expect(useCase.execute({ actor: actor('CL_ADMIN') })).rejects.toBeInstanceOf(RetentionPolicyForbiddenError);
    const result = await useCase.execute({ actor: actor('AM') });
    expect(result).toHaveLength(1);
    expect(repo.findAllActive).toHaveBeenCalledTimes(1);
  });

  it('ListPiiFieldMappingsUseCase: 403 for OP, findAll for AM', async () => {
    const repo = { findAll: vi.fn().mockResolvedValue([{ id: 'p1' }]), findByAction: vi.fn(), findById: vi.fn(), save: vi.fn(), update: vi.fn(), delete: vi.fn() };
    const useCase = new ListPiiFieldMappingsUseCase(repo as any);

    await expect(useCase.execute({ actor: actor('OP') })).rejects.toBeInstanceOf(RetentionPolicyForbiddenError);
    const result = await useCase.execute({ actor: actor('AM') });
    expect(result).toHaveLength(1);
  });
});

describe('B6 #758 DeletePreservationRuleUseCase', () => {
  let repo: any;
  let auditService: any;
  let useCase: DeletePreservationRuleUseCase;

  beforeEach(() => {
    repo = {
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByType: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };
    auditService = { log: vi.fn() };
    useCase = new DeletePreservationRuleUseCase(repo, auditService);
  });

  it('rejects non-AM with RetentionPolicyForbiddenError', async () => {
    await expect(
      useCase.execute({ id: '11111111-1111-4111-8111-111111111111', actor: actor('OP') }),
    ).rejects.toBeInstanceOf(RetentionPolicyForbiddenError);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('atomically soft-deletes (never replays a full upsert) and audits', async () => {
    repo.findById.mockResolvedValueOnce(makeRule());

    await useCase.execute({ id: '11111111-1111-4111-8111-111111111111', actor: actor('AM') });

    expect(repo.softDelete).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    // The atomic soft delete must NOT go through the full-record upsert path.
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'audit.preservation_rule_deleted' }),
    );
  });

  it('unknown id -> PreservationRuleNotFoundError (404)', async () => {
    repo.findById.mockResolvedValueOnce(null);
    await expect(
      useCase.execute({ id: '11111111-1111-4111-8111-111111111111', actor: actor('AM') }),
    ).rejects.toBeInstanceOf(PreservationRuleNotFoundError);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});
