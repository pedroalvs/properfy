import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import {
  ServiceGroupNotFoundError,
  ServiceGroupInvalidStatusError,
  GroupAlreadyAcceptedError,
} from '../../domain/service-group.errors';

export interface UnpublishServiceGroupInput {
  groupId: string;
  reason: string;
  actor: AuthContext;
}

export interface UnpublishServiceGroupOutput {
  id: string;
  status: string;
}

/**
 * Pulls a published group off the marketplace: `PUBLISHED → DRAFT`.
 *
 * The member appointments are deliberately untouched. They are already in
 * AWAITING_INSPECTOR — the state `CreateServiceGroupUseCase` puts them in, long
 * before publish — and `PublishServiceGroupUseCase` only asserts that status
 * rather than writing it. So "AWAITING_INSPECTOR members under a DRAFT group"
 * is exactly the shape of a group that has never been published, which is what
 * makes publishing it again a no-op change.
 *
 * Nothing needs compensating either: a PUBLISHED group has no assigned
 * inspector, and publishing sends no notifications. Marketplace visibility is a
 * live query, so the offer disappears the moment the status flips.
 */
export class UnpublishServiceGroupUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: UnpublishServiceGroupInput): Promise<UnpublishServiceGroupOutput> {
    const { actor, groupId, reason } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'service_group.unpublish',
      entityType: 'ServiceGroup',
    });

    const result = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }

    const { group, primaryTenantId } = result;

    if (!group.canUnpublish()) {
      throw new ServiceGroupInvalidStatusError('PUBLISHED', group.status);
    }

    // Re-checks the status inside the write. Losing this race means an
    // inspector accepted the offer first, and their assignment must stand.
    const updated = await this.serviceGroupRepo.unpublishOptimistic(groupId);
    if (updated === 0) {
      throw new GroupAlreadyAcceptedError();
    }

    this.auditService.log({
      action: 'service_group.unpublished',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: primaryTenantId,
      before: { status: group.status, publishedAt: group.publishedAt },
      after: { status: 'DRAFT', publishedAt: null },
      reason,
    });

    return {
      id: groupId,
      status: 'DRAFT',
    };
  }
}
