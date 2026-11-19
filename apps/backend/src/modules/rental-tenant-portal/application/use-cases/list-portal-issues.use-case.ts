import type { PortalPropertyIssuesResponse } from '@properfy/shared';
import type { IPropertyIssueRepository } from '../../../property-file/domain/property-issue.repository';
import type { IPropertyFileRepository } from '../../../property-file/domain/property-file.repository';
import type { PropertyFileEntity } from '../../../property-file/domain/property-file.entity';
import { toPortalPropertyIssueResponse } from '../portal-issue-mappers';

export interface ListPortalIssuesCommand {
  /** The appointment pinned by the portal token (never client input). */
  appointmentId: string;
}

/**
 * List the rental tenant's own submitted reports for this appointment (F10-4).
 * Only `RENTAL_TENANT_PORTAL` issues of the token's appointment are returned,
 * mapped to the privacy-reduced DTO — never a staff/inspector issue, another
 * appointment, or any reviewer identity.
 */
export class ListPortalIssuesUseCase {
  constructor(
    private readonly issueRepo: IPropertyIssueRepository,
    private readonly fileRepo: IPropertyFileRepository,
  ) {}

  async execute(command: ListPortalIssuesCommand): Promise<PortalPropertyIssuesResponse> {
    const scope = await this.issueRepo.findAppointmentScope(command.appointmentId);
    // A token always pins a valid appointment; be defensive and return nothing
    // rather than disclose anything if the appointment is gone.
    if (!scope) return { issues: [] };

    const all = await this.issueRepo.listByAppointment(command.appointmentId, scope.tenantId);
    const portalIssues = all.filter((issue) => issue.source === 'RENTAL_TENANT_PORTAL');

    const photos = await this.fileRepo.listReadyPhotosByIssueIds(portalIssues.map((i) => i.id));
    const photosByIssue = new Map<string, PropertyFileEntity[]>();
    for (const photo of photos) {
      if (!photo.issueId) continue;
      const list = photosByIssue.get(photo.issueId) ?? [];
      list.push(photo);
      photosByIssue.set(photo.issueId, list);
    }

    return {
      issues: portalIssues.map((issue) =>
        toPortalPropertyIssueResponse(issue, photosByIssue.get(issue.id) ?? []),
      ),
    };
  }
}
