import type { AuthContext, MarkPropertyIssueSeenResponse } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import type { IPropertyIssueRepository } from '../../domain/property-issue.repository';
import type { PropertyScopeService } from '../property-scope.service';
import { PropertyIssueNotFoundError } from '../../domain/property-file.errors';

export interface MarkPropertyIssueSeenCommand {
  actor: AuthContext;
  issueId: string;
  requestId?: string;
}

export class MarkPropertyIssueAsSeenUseCase {
  constructor(
    private readonly issueRepo: IPropertyIssueRepository,
    private readonly scope: PropertyScopeService,
    private readonly audit: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(command: MarkPropertyIssueSeenCommand): Promise<MarkPropertyIssueSeenResponse> {
    const { actor, issueId, requestId } = command;
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: 'property_issue.mark_seen',
      entityType: 'PropertyIssue',
    });

    const issue = await this.issueRepo.findById(issueId);
    if (!issue || issue.deletedAt) throw new PropertyIssueNotFoundError();
    await this.scope.assertCanReadIssue(actor, issue);

    const now = this.clock.now();
    // CAS: only the call that flips unseen → seen audits (D23); concurrent clicks
    // all return the recorded seer without re-auditing.
    const affected = await this.issueRepo.markSeenCas(issueId, actor.userId, now);
    if (affected === 0) {
      const current = await this.issueRepo.findById(issueId);
      return {
        seen: true,
        alreadySeen: true,
        seenAt: current?.seenAt ? current.seenAt.toISOString() : null,
        seenByUserId: current?.seenByUserId ?? null,
      };
    }

    this.audit.log({
      action: 'property_issue.seen',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'PropertyIssue',
      entityId: issueId,
      tenantId: issue.tenantId,
      after: { seenByUserId: actor.userId },
      requestId,
    });

    return { seen: true, alreadySeen: false, seenAt: now.toISOString(), seenByUserId: actor.userId };
  }
}
