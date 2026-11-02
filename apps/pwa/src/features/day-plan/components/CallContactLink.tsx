import { Phone } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import type { DayPlanStop } from '@properfy/shared';

type PrimaryContact = NonNullable<DayPlanStop['primaryContact']>;
type ContactRole = PrimaryContact['role'];

/** Human label for a contact role (L-F04-08). `OTHER` has no parenthetical. */
const ROLE_LABELS: Record<ContactRole, string | null> = {
  RENTAL_TENANT: 'tenant',
  RENTAL_TENANT_REPRESENTATIVE: "tenant's representative",
  HOUSEKEEPER: 'housekeeper',
  PROPERTY_MANAGER: 'property manager',
  BROKER: 'broker',
  OTHER: null,
};

interface CallContactLinkProps {
  contact: PrimaryContact | null;
  className?: string;
}

/**
 * `tel:` link to the stop's primary contact, labelled "Call {name} ({role})"
 * (no parenthetical for `OTHER`). Renders nothing without a phone number; the
 * server chooses the contact, the PWA never reorders them.
 */
export function CallContactLink({ contact, className }: CallContactLinkProps) {
  if (!contact || !contact.phone) return null;

  const label = ROLE_LABELS[contact.role];
  const text = label ? `Call ${contact.name} (${label})` : `Call ${contact.name}`;

  return (
    <a
      href={`tel:${contact.phone}`}
      aria-label={text}
      className={cn(
        'inline-flex min-h-touch items-center gap-2 text-sm font-semibold text-primary',
        className,
      )}
    >
      <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </a>
  );
}
