import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { ITemplateImageBindingRepository, TemplateImageBindingData } from '../../domain/template-image-binding.repository';
import type { IEmailAssetRepository } from '../../domain/email-asset.repository';
import { NotFoundError } from '../../../../shared/domain/errors';

export interface EditImageBindingInput {
  assetId: string;
  bindingId: string;
  altText?: string;
  width?: number;
  height?: number;
  actor: AuthContext;
}

export class EditImageBindingUseCase {
  constructor(
    private readonly bindingRepo: ITemplateImageBindingRepository,
    private readonly assetRepo: IEmailAssetRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: EditImageBindingInput): Promise<TemplateImageBindingData> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'email_assets.edit_binding',
      entityType: 'TemplateImageBinding',
    });

    const asset = await this.assetRepo.findById(input.assetId);
    if (!asset) throw new NotFoundError('ASSET_NOT_FOUND', 'Email asset not found');

    const bindings = await this.bindingRepo.findByAsset(input.assetId);
    const binding = bindings.find((b) => b.id === input.bindingId);
    if (!binding) throw new NotFoundError('BINDING_NOT_FOUND', 'Image binding not found');

    return this.bindingRepo.upsert({
      templateId: binding.templateId,
      assetId: binding.assetId,
      placeholderKey: binding.placeholderKey,
      altText: input.altText ?? binding.altText,
      width: input.width ?? binding.width,
      height: input.height ?? binding.height,
    });
  }
}
