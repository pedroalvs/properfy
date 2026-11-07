import type { AuthContext, ListPropertyFilesQuery, ListPropertyFilesResponse } from '@properfy/shared';
import type { IPropertyFileRepository } from '../../domain/property-file.repository';
import type { PropertyScopeService } from '../property-scope.service';
import { toPropertyFileResponse } from '../mappers';

export interface ListPropertyFilesCommand {
  actor: AuthContext;
  query: ListPropertyFilesQuery;
}

export class ListPropertyFilesUseCase {
  constructor(
    private readonly fileRepo: IPropertyFileRepository,
    private readonly scope: PropertyScopeService,
  ) {}

  async execute(command: ListPropertyFilesCommand): Promise<ListPropertyFilesResponse> {
    const { actor, query } = command;
    const listScope = await this.scope.resolveReadListScope(actor, query);
    const filter = { type: query.type, tenantId: listScope.tenantId };

    const files = query.appointmentId
      ? await this.fileRepo.listReadyByAppointment(query.appointmentId, filter)
      : await this.fileRepo.listReadyByProperty(query.propertyId!, filter);

    // Per-type counts ignore the active `type` filter so the sub-tabs show totals.
    const counts = query.appointmentId
      ? await this.fileRepo.countsByAppointment(query.appointmentId, listScope.tenantId)
      : await this.fileRepo.countsByProperty(query.propertyId!, listScope.tenantId);

    return { files: files.map(toPropertyFileResponse), counts };
  }
}
