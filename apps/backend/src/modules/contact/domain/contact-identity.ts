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

export interface InlineContactMatch {
  contactId: string | null;
  snapshotName: string;
  snapshotEmail: string | null;
  snapshotPhone: string | null;
}

/**
 * Decides how an inline contact payload maps onto the registry candidates
 * that share one of its channels: link the fully identical candidate, keep
 * the payload as an unlinked snapshot on a partial collision (the global
 * unique indexes forbid creating a duplicate row for that channel), or
 * return null so the caller creates a new registry contact.
 */
export function resolveInlineContactMatch(
  candidates: ContactEntity[],
  inline: ContactIdentityCandidate,
): InlineContactMatch | null {
  const identical = candidates.find((c) => isIdenticalContact(c, inline));
  if (identical) {
    return {
      contactId: identical.id,
      snapshotName: identical.displayName,
      snapshotEmail: identical.primaryEmail,
      snapshotPhone: identical.primaryPhone,
    };
  }
  if (candidates.length > 0) {
    return {
      contactId: null,
      snapshotName: inline.name,
      snapshotEmail: inline.email,
      snapshotPhone: inline.phone,
    };
  }
  return null;
}
