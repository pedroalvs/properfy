import type { IAppCredentialRepository } from '../../domain/app-credential.repository';
import type { AppCredentialEntity } from '../../domain/app-credential.entity';
import { AppCredentialNotFoundError } from '../../domain/app-credential.errors';

export class GetAppCredentialUseCase {
  constructor(private readonly repo: IAppCredentialRepository) {}

  async execute(id: string): Promise<AppCredentialEntity> {
    const credential = await this.repo.findById(id);
    if (!credential) {
      throw new AppCredentialNotFoundError();
    }
    return credential;
  }
}
