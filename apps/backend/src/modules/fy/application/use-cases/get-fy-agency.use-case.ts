import type { FyAgency } from '@properfy/shared';

import { AgencyNotFoundError } from '../../domain/fy.errors';
import type { IFyRepository } from '../../domain/fy.repository';

export class GetFyAgencyUseCase {
  constructor(private readonly fyRepo: IFyRepository) {}

  async execute(input: { agencyId: string }): Promise<FyAgency> {
    const agency = await this.fyRepo.findAgencyById(input.agencyId);
    if (!agency) {
      throw new AgencyNotFoundError();
    }
    return agency;
  }
}
