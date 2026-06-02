import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IEmailAssetRepository } from '../../domain/email-asset.repository';
import type { ITemplateImageBindingRepository } from '../../domain/template-image-binding.repository';
import type { IEmailAssetStorageService } from '../../domain/email-asset-storage.service';
import { ConflictError, NotFoundError } from '../../../../shared/domain/errors';

export interface DeleteEmailAssetInput {
  assetId: string;
  /** Must be explicitly true (server-enforced consent). Missing/false → 400 CONFIRMATION_REQUIRED. */
  confirm: true;
  actor: AuthContext;
}

export interface DeleteEmailAssetOutput {
  id: string;
  everSent: boolean;
}

/**
 * Deletes an email asset.
 * - `confirm: true` required (server-enforced consent, FR-026a).
 * - Blocked if asset is bound to any template → 409 ASSET_IN_USE with usage list.
 * - Physically purges (storage object + DB row) when unbound.
 * - `ever_sent` does NOT block deletion — only drives the UI warning copy.
 */
export class DeleteEmailAssetUseCase {
  constructor(
    private readonly emailAssetRepo: IEmailAssetRepository,
    private readonly bindingRepo: ITemplateImageBindingRepository,
    private readonly storageService: IEmailAssetStorageService,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: DeleteEmailAssetInput): Promise<DeleteEmailAssetOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'email_assets.delete',
      entityType: 'EmailAsset',
    });

    const asset = await this.emailAssetRepo.findById(input.assetId);
    if (!asset) throw new NotFoundError('ASSET_NOT_FOUND', 'Email asset not found');

    // Check in-use bindings
    const bindings = await this.bindingRepo.findByAsset(input.assetId);
    if (bindings.length > 0) {
      const templateIds = [...new Set(bindings.map((b) => b.templateId))];
      throw new ConflictError(
        'ASSET_IN_USE',
        `Asset is used in ${templateIds.length} template(s) — remove bindings first`,
        { usages: templateIds },
      );
    }

    // Physical purge: storage object + DB row
    try {
      await this.storageService.deleteObject(asset.storageKey);
    } catch {
      // Tolerate storage errors (object may have already been deleted externally)
    }
    await this.emailAssetRepo.hardDelete(input.assetId);

    this.auditService.log({
      action: 'EMAIL_ASSET_DELETED',
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'EMAIL_ASSET',
      entityId: input.assetId,
      tenantId: asset.tenantId ?? undefined,
      after: { everSent: asset.everSent, storageKey: asset.storageKey },
    });

    return { id: input.assetId, everSent: asset.everSent };
  }
}
