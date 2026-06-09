import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IEmailAssetRepository, EmailAssetData } from '../../domain/email-asset.repository';

export interface ListEmailAssetsInput {
  tenantId?: string;
  actor: AuthContext;
}

export interface ListEmailAssetsOutput {
  data: EmailAssetData[];
}

export class ListEmailAssetsUseCase {
  constructor(
    private readonly emailAssetRepo: IEmailAssetRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ListEmailAssetsInput): Promise<ListEmailAssetsOutput> {
    this.authorizationService.assertRoles(input.actor, ['AM', 'OP'], {
      action: 'email_assets.list',
      entityType: 'EmailAsset',
    });

    const tenantId = input.actor.role === 'AM' ? (input.tenantId ?? null) : (input.actor.tenantId ?? null);
    const data = await this.emailAssetRepo.findAll(tenantId);
    return { data };
  }
}
