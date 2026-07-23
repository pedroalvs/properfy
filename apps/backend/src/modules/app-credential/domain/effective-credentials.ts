import type { AppCredentialEntity } from './app-credential.entity';

/**
 * Merges explicitly linked credentials with the agency's default credentials
 * into the effective list surfaced on an appointment. Linked credentials come
 * first (their insertion order preserved); defaults follow in the order given
 * (the repository sorts them by name). A default that is also explicitly
 * linked appears once, as the linked instance.
 */
export function mergeEffectiveCredentials(
  linked: AppCredentialEntity[],
  defaults: AppCredentialEntity[],
): AppCredentialEntity[] {
  const linkedIds = new Set(linked.map((credential) => credential.id));
  return [...linked, ...defaults.filter((credential) => !linkedIds.has(credential.id))];
}
