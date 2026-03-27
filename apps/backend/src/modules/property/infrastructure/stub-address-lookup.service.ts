import type { AddressLookupSuggestion, IAddressLookupService } from '../domain/address-lookup.service';

export class StubAddressLookupService implements IAddressLookupService {
  async search(_query: string, _options?: { limit?: number; country?: string }): Promise<AddressLookupSuggestion[]> {
    return [];
  }
}
