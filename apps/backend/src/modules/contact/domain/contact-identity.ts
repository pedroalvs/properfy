import type { ContactEntity } from './contact.entity';

export interface ContactIdentityCandidate {
  name: string;
  email: string | null;
  phone: string | null;
}

/**
 * A registry contact may only be reused for an inline/imported contact when
 * the two are fully identical: display name (trimmed, case-insensitive) plus
 * primary email and primary phone (exact — both values arrive normalized, and
 * null must equal null). Any partial overlap means "same channel, different
 * person data", which must NOT silently link the existing contact.
 */
export function isIdenticalContact(
  contact: ContactEntity,
  candidate: ContactIdentityCandidate,
): boolean {
  const sameName = contact.displayName.trim().toLowerCase() === candidate.name.trim().toLowerCase();
  const sameEmail = (contact.primaryEmail ?? null) === (candidate.email ?? null);
  const samePhone = (contact.primaryPhone ?? null) === (candidate.phone ?? null);
  return sameName && sameEmail && samePhone;
}
