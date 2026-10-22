import { Phone } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { ContactChannel, JobDetailsTenantContact } from '../types';

const ROLE_LABELS: Record<string, string> = {
  RENTAL_TENANT: 'Tenant',
  RENTAL_TENANT_REPRESENTATIVE: 'Representative',
  HOUSEKEEPER: 'Housekeeper',
  OTHER: 'Other',
};

function roleLabel(role: string): string {
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  const words = role.toLowerCase().split('_');
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function channelHref(channel: ContactChannel): string | null {
  if (channel.channel === 'PHONE') return `tel:${channel.value}`;
  return null;
}

interface ContactsSectionProps {
  contacts: JobDetailsTenantContact[];
}

/**
 * All appointment contacts the inspector may need on site (PM and broker are
 * handled separately server-side). Snapshot name/phone plus live-registry
 * extras: company and additional channels. Emails are never shown to inspectors.
 */
export function ContactsSection({ contacts }: ContactsSectionProps) {
  if (contacts.length === 0) return null;

  return (
    <Card className="overflow-hidden p-0" data-testid="contacts-section">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Contacts</p>
      </div>
      <ul>
        {contacts.map((contact, index) => {
          const extraChannels = (contact.additionalChannels ?? []).filter(
            (channel) => channel.channel !== 'EMAIL',
          );
          const hasDetails = Boolean(contact.phone || extraChannels.length > 0);
          return (
            <li
              key={index}
              className={index > 0 ? 'border-t border-border' : ''}
              data-testid="contact-item"
            >
              <div className="px-4 pt-3 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{contact.name}</p>
                  <Badge tone="gray">{roleLabel(contact.role)}</Badge>
                  {contact.isPrimary && (
                    <Badge tone="blue" data-testid="contact-primary-badge">
                      Primary
                    </Badge>
                  )}
                </div>
                {contact.company && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{contact.company}</p>
                )}
                {!hasDetails && (
                  <p className="mt-1 text-xs text-muted-foreground">No contact details available.</p>
                )}
              </div>

              {hasDetails && (
                <div className="divide-y divide-border">
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="flex min-h-touch items-center gap-2 px-4 py-2.5 text-sm font-semibold text-success"
                      data-testid={`contact-phone-link-${index}`}
                    >
                      <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {contact.phone}
                    </a>
                  )}
                  {extraChannels.map((channel, channelIndex) => {
                    const href = channelHref(channel);
                    const content = (
                      <>
                        <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="flex flex-col text-left">
                          {channel.label && (
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                              {channel.label}
                            </span>
                          )}
                          <span>{channel.value}</span>
                        </span>
                      </>
                    );
                    return href ? (
                      <a
                        key={channelIndex}
                        href={href}
                        className="flex min-h-touch items-center gap-2 px-4 py-2.5 text-sm font-semibold text-success"
                        data-testid={`contact-extra-channel-${index}-${channelIndex}`}
                      >
                        {content}
                      </a>
                    ) : (
                      <p
                        key={channelIndex}
                        className="flex min-h-touch items-center gap-2 px-4 py-2.5 text-sm text-foreground"
                        data-testid={`contact-extra-channel-${index}-${channelIndex}`}
                      >
                        {content}
                      </p>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
