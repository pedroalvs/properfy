import type { ApiKeyResponse, ApiKeyRole, ApiKeyScope } from '@properfy/shared';

import { FY_SCOPE, FY_KEY_ROLE, isFyKey } from './fyKey';
import { MAIL_SCOPE, MAIL_KEY_ROLE, isMailKey } from './mailKey';

/**
 * Describes one inbound machine-key integration (Fy agent, Mail Bot). The API
 * keys list, create dialog and integration page are generic over this type, so
 * a new integration is a new descriptor — not a new copy of each component.
 *
 * Every machine key is created server-side with the fixed `role`/`scope`; the
 * role and scope are never shown or chosen in the UI.
 */
export interface MachineKeyType {
  /** Stable id for React keys and tile identity. */
  id: 'fy' | 'mail';
  scope: ApiKeyScope;
  role: ApiKeyRole;
  /** Tile + page title (e.g. "Mail Bot - AutoLabs"). */
  label: string;
  /** One-line description for the page header. */
  description: string;
  /** URL segment of the integration's own page: /integrations/<slug>. */
  slug: string;
  /** Provider logo glyph in /images/integrations/<logoKey>.svg. */
  logoKey: string;
  /** Brand background behind the white logo glyph. */
  brandColor: string;
  /** "New …" button + create-dialog title. */
  newKeyLabel: string;
  /** Create-dialog name placeholder. */
  namePlaceholder: string;
  /** Scope string shown in the info banner copy. */
  scopeCode: string;
  /** Exact-contract match — drives the active-key count and the legacy badge. */
  isKeyOfType: (key: ApiKeyResponse) => boolean;
  /** Which keys this integration's table lists. */
  listFilter: (key: ApiKeyResponse) => boolean;
  /** Badge shown for a listed key that is NOT an exact match (omit to never show one). */
  legacyBadgeLabel?: string;
}

export const FY_KEY_TYPE: MachineKeyType = {
  id: 'fy',
  scope: FY_SCOPE,
  role: FY_KEY_ROLE,
  label: 'Fy Integration',
  description:
    'Inbound API access for the Fy WhatsApp agent — every key is restricted to the bot:fy scope',
  slug: 'fy-api',
  logoKey: 'fy_webhook',
  brandColor: '#25D366',
  newKeyLabel: 'New Fy key',
  namePlaceholder: 'e.g. Fy production',
  scopeCode: 'bot:fy',
  isKeyOfType: isFyKey,
  // The Fy page keeps showing legacy/unscoped keys (so they can be revoked) but
  // never the Mail Bot keys, which have their own page.
  listFilter: (key) => !isMailKey(key),
  legacyBadgeLabel: 'Legacy — not Fy contract',
};

export const MAIL_KEY_TYPE: MachineKeyType = {
  id: 'mail',
  scope: MAIL_SCOPE,
  role: MAIL_KEY_ROLE,
  label: 'Mail Bot - AutoLabs',
  description:
    'Read-only inbound API access for the AutoLabs mail bot — every key is restricted to the bot:mail scope',
  slug: 'mail-bot',
  logoKey: 'mail_bot',
  brandColor: '#21566E',
  newKeyLabel: 'New Mail Bot key',
  namePlaceholder: 'e.g. Mail Bot production',
  scopeCode: 'bot:mail',
  isKeyOfType: isMailKey,
  listFilter: isMailKey,
};

/** Every inbound machine-key integration, in display order on the API Keys tab. */
export const MACHINE_KEY_TYPES: MachineKeyType[] = [FY_KEY_TYPE, MAIL_KEY_TYPE];
