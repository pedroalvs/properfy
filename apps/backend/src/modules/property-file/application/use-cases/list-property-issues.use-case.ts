import type { AuthContext, ListPropertyIssuesQuery, ListPropertyIssuesResponse } from '@properfy/shared';
import type { IPropertyIssueRepository } from '../../domain/property-issue.repository';
import type { IPropertyFileRepository } from '../../domain/property-file.repository';
import type { PropertyScopeService } from '../property-scope.service';
import type { PropertyFileEntity } from '../../domain/property-file.entity';
import { toPropertyIssueResponse } from '../mappers';

export interface ListPropertyIssuesCommand {
  actor: AuthContext;
  query: ListPropertyIssuesQuery;
}

export class ListPropertyIssuesUseCase {
  constructor(
    private readonly issueRepo: IPropertyIssueRepository,
    private readonly fileRepo: IPropertyFileRepository,
    private readonly scope: PropertyScopeService,
  ) {}

  async execute(command: ListPropertyIssuesCommand): Promise<ListPropertyIssuesResponse> {
    const { actor, query } = command;
    const listScope = await this.scope.resolveReadListScope(actor, query);

    const issues = query.appointmentId
      ? await this.issueRepo.listByAppointment(query.appointmentId, listScope.tenantId)
      : await this.issueRepo.listByProperty(query.propertyId!, listScope.tenantId);

    const photos = await this.fileRepo.listReadyPhotosByIssueIds(issues.map((i) => i.id));
    const photosByIssue = new Map<string, PropertyFileEntity[]>();
    for (const photo of photos) {
      if (!photo.issueId) continue;
      const list = photosByIssue.get(photo.issueId) ?? [];
      list.push(photo);
      photosByIssue.set(photo.issueId, list);
    }

    return {
      issues: issues.map((issue) =>
        toPropertyIssueResponse(issue, photosByIssue.get(issue.id) ?? []),
      ),
    };
  }
}
