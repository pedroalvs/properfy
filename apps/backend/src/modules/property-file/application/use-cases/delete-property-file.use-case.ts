import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import type { IPropertyFileRepository } from '../../domain/property-file.repository';
import type { PropertyScopeService } from '../property-scope.service';
import { PropertyFileNotFoundError } from '../../domain/property-file.errors';

export interface DeletePropertyFileCommand {
  actor: AuthContext;
  fileId: string;
  requestId?: string;
}

export class DeletePropertyFileUseCase {
  constructor(
    private readonly fileRepo: IPropertyFileRepository,
    private readonly scope: PropertyScopeService,
    private readonly audit: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(command: DeletePropertyFileCommand): Promise<void> {
    const { actor, fileId, requestId } = command;
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'property_file.delete',
      entityType: 'PropertyFile',
    });

    const file = await this.fileRepo.findById(fileId);
    if (!file || file.deletedAt) throw new PropertyFileNotFoundError();
    await this.scope.assertCanReadFile(actor, file);

    const now = this.clock.now();
    await this.fileRepo.softDelete(file.id, actor.userId, now);

    this.audit.log({
      action: 'property_file.deleted',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'PropertyFile',
      entityId: file.id,
      tenantId: file.tenantId,
      before: { type: file.type, version: file.version, fileName: file.fileName },
      requestId,
    });
  }
}
