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
  if (channel.channel === 'EMAIL') return `mailto:${channel.value}`;
  return null;
}

function channelIcon(channel: ContactChannel): string {
  return channel.channel === 'EMAIL' ? 'mdi-email-outline' : 'mdi-phone';
}

interface ContactsSectionProps {
  contacts: JobDetailsTenantContact[];
}

/**
 * All appointment contacts the inspector may need on site (PM and broker are
 * handled separately server-side). Snapshot name/phone/email plus live-registry
 * extras: company and additional channels.
 */
export function ContactsSection({ contacts }: ContactsSectionProps) {
  if (contacts.length === 0) return null;

  return (
    <section
      className="overflow-hidden rounded-[20px] border border-black/[0.06] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
      data-testid="contacts-section"
    >
      <div className="px-4 pt-4 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Contacts</p>
      </div>
      <ul>
        {contacts.map((contact, index) => {
          const extraChannels = contact.additionalChannels ?? [];
          const hasDetails = Boolean(contact.phone || contact.email || extraChannels.length > 0);
          return (
            <li
              key={index}
              className={index > 0 ? 'border-t border-black/[0.06]' : ''}
              data-testid="contact-item"
            >
              <div className="px-4 pt-3 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">{contact.name}</p>
                  <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
                    {roleLabel(contact.role)}
                  </span>
                  {contact.isPrimary && (
                    <span
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                      data-testid="contact-primary-badge"
                    >
                      Primary
                    </span>
                  )}
                </div>
                {contact.company && (
                  <p className="mt-0.5 text-xs text-text-muted">{contact.company}</p>
                )}
                {!hasDetails && (
                  <p className="mt-1 text-xs text-text-muted">No contact details available.</p>
                )}
              </div>

              {hasDetails && (
                <div className="divide-y divide-black/[0.04]">
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="flex min-h-touch items-center gap-2 px-4 py-2.5 text-sm font-semibold text-success"
                      data-testid={`contact-phone-link-${index}`}
                    >
                      <i className="mdi mdi-phone text-base" aria-hidden="true" />
                      {contact.phone}
                    </a>
                  )}
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex min-h-touch items-center gap-2 px-4 py-2.5 text-sm font-semibold text-primary"
                      data-testid={`contact-email-link-${index}`}
                    >
                      <i className="mdi mdi-email-outline text-base" aria-hidden="true" />
                      {contact.email}
                    </a>
                  )}
                  {extraChannels.map((channel, channelIndex) => {
                    const href = channelHref(channel);
                    const content = (
                      <>
                        <i className={`mdi ${channelIcon(channel)} text-base`} aria-hidden="true" />
                        <span className="flex flex-col text-left">
                          {channel.label && (
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
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
                        className={`flex min-h-touch items-center gap-2 px-4 py-2.5 text-sm font-semibold ${channel.channel === 'EMAIL' ? 'text-primary' : 'text-success'}`}
                        data-testid={`contact-extra-channel-${index}-${channelIndex}`}
                      >
                        {content}
                      </a>
                    ) : (
                      <p
                        key={channelIndex}
                        className="flex min-h-touch items-center gap-2 px-4 py-2.5 text-sm text-text-primary"
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
    </section>
  );
}
