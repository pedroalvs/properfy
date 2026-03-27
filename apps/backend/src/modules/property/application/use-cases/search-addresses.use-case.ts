import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IAddressLookupService } from '../../domain/address-lookup.service';

export interface SearchAddressesInput {
  query: string;
  limit?: number;
  country?: string;
  actor: AuthContext;
}

export class SearchAddressesUseCase {
  constructor(private readonly addressLookupService: IAddressLookupService) {}

  async execute(input: SearchAddressesInput) {
    const { actor, query, limit, country } = input;

    if (actor.role === 'INSP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    return this.addressLookupService.search(query, { limit, country });
  }
}
