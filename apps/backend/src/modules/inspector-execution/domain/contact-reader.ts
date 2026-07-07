/** Additional channel entry stored on the contact registry row (021). */
export interface ContactRegistryChannel {
  channel: string;
  value: string;
  label?: string;
}

/** Live contact-registry fields the inspector detail enriches snapshots with. */
export interface ContactRegistryInfo {
  id: string;
  type: string;
  company: string | null;
  additionalChannels: ContactRegistryChannel[];
}

/**
 * Cross-module read port into the contact registry (cross-tenant by design —
 * inspector detail already validates assignment; mirrors IServiceTypeReader).
 */
export interface IContactReader {
  findByIds(ids: string[]): Promise<ContactRegistryInfo[]>;
}
