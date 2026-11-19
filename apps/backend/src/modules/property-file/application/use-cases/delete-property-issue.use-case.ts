import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@properfy/shared';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import type { IPropertyIssueRepository } from '../../domain/property-issue.repository';
import type { IPropertyFileRepository } from '../../domain/property-file.repository';
import type { PropertyScopeService } from '../property-scope.service';
import { PropertyIssueNotFoundError } from '../../domain/property-file.errors';

export interface DeletePropertyIssueCommand {
  actor: AuthContext;
  issueId: string;
  requestId?: string;
}

export class DeletePropertyIssueUseCase {
  constructor(
    private readonly prisma: PrismaClient | undefined,
    private readonly issueRepo: IPropertyIssueRepository,
    private readonly fileRepo: IPropertyFileRepository,
    private readonly scope: PropertyScopeService,
    private readonly audit: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(command: DeletePropertyIssueCommand): Promise<void> {
    const { actor, issueId, requestId } = command;
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'property_issue.delete',
      entityType: 'PropertyIssue',
    });

    const issue = await this.issueRepo.findById(issueId);
    if (!issue || issue.deletedAt) throw new PropertyIssueNotFoundError();
    await this.scope.assertCanReadIssue(actor, issue);

    const now = this.clock.now();
    await runInTransaction(this.prisma, async ({ tx, defer }) => {
      // Soft-delete the issue AND its photos together (D27).
      await this.issueRepo.softDelete(issueId, actor.userId, now, tx);
      await this.fileRepo.softDeletePhotosByIssueId(issueId, actor.userId, now, tx);
      defer(async () => {
        this.audit.log({
          action: 'property_issue.deleted',
          actorType: 'USER',
          actorId: actor.userId,
          entityType: 'PropertyIssue',
          entityId: issueId,
          tenantId: issue.tenantId,
          before: { source: issue.source, appointmentId: issue.appointmentId },
          requestId,
        });
      });
    });
  }
}
