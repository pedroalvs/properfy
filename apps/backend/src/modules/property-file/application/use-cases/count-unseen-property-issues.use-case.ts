import type { AuthContext, PropertyIssueUnseenCountResponse } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { assertTenantScope } from '../../../../shared/domain/require-tenant-scope';
import type { IPropertyIssueIndicatorReader } from '../../domain/property-issue.repository';

const ACTION = 'property_issue.unseen_count';

export interface CountUnseenPropertyIssuesCommand {
  actor: AuthContext;
}

export class CountUnseenPropertyIssuesUseCase {
  constructor(
    private readonly reader: IPropertyIssueIndicatorReader,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(
    command: CountUnseenPropertyIssuesCommand,
  ): Promise<PropertyIssueUnseenCountResponse> {
    const { actor } = command;
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN'], {
      action: ACTION,
      entityType: 'PropertyIssue',
    });

    // AM/OP are cross-tenant (no predicate); CL_ADMIN is pinned to its tenant.
    const tenantId = actor.role === 'CL_ADMIN' ? assertTenantScope(actor, ACTION) : undefined;

    const [appointmentsWithUnseenIssues, propertiesWithUnseenIssues] = await Promise.all([
      this.reader.countAppointmentsWithUnseenIssues(tenantId),
      this.reader.countPropertiesWithUnseenIssuesWithoutAppointment(tenantId),
    ]);

    return { appointmentsWithUnseenIssues, propertiesWithUnseenIssues };
  }
}
