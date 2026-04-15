import type { JobDetails } from '../types';

interface JobDetailsSectionProps {
  jobDetails: JobDetails;
}

function formatCurrency(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function JobDetailsSection({ jobDetails }: JobDetailsSectionProps) {
  const {
    agency,
    tenantContacts,
    keys,
    keyLocation,
    keyLocationMapUrl,
    propertyManager,
    payment,
    inspectionAppLink,
  } = jobDetails;

  return (
    <div className="flex flex-col gap-3" data-testid="job-details-section">
      {/* Agency */}
      {agency && (
        <section className="rounded-[20px] border border-black/[0.06] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.07)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Agency</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">{agency}</p>
        </section>
      )}

      {/* Tenant Contacts */}
      {tenantContacts.length > 0 && (
        <section
          className="overflow-hidden rounded-[20px] border border-black/[0.06] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
          data-testid="job-tenant-contacts"
        >
          <div className="px-4 pt-4 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Tenant Contacts</p>
            <div className="mt-2 flex flex-col gap-3">
              {tenantContacts.map((contact, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-text-primary">{contact.name}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="inline-flex items-center gap-1 text-primary"
                        data-testid={`tenant-contact-email-${index}`}
                      >
                        <i className="mdi mdi-email-outline text-sm" aria-hidden="true" />
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="inline-flex items-center gap-1 text-success"
                        data-testid={`tenant-contact-phone-${index}`}
                      >
                        <i className="mdi mdi-phone text-sm" aria-hidden="true" />
                        {contact.phone}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Keys */}
      {keys && (
        <section
          className="overflow-hidden rounded-[20px] border border-warning/20 bg-warning/8 shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
          data-testid="job-keys-section"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <i className="mdi mdi-key text-xl text-warning shrink-0" aria-hidden="true" />
            <div>
              <span className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                Key required
              </span>
              {keyLocation && (
                <p className="mt-1 text-sm text-text-primary">{keyLocation}</p>
              )}
            </div>
          </div>
          {keyLocationMapUrl && (
            <a
              href={keyLocationMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 border-t border-warning/20 bg-warning/5 px-4 py-3 text-sm font-bold text-warning"
              data-testid="key-location-map-link"
            >
              <i className="mdi mdi-navigation text-base" aria-hidden="true" />
              Open in Maps
            </a>
          )}
        </section>
      )}

      {/* Property Manager */}
      {propertyManager && (propertyManager.name || propertyManager.email || propertyManager.phone) && (
        <section
          className="overflow-hidden rounded-[20px] border border-black/[0.06] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
          data-testid="job-property-manager"
        >
          <div className="px-4 pt-4 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Property Manager</p>
            {propertyManager.name && (
              <p className="mt-1 text-sm font-semibold text-text-primary">{propertyManager.name}</p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
              {propertyManager.email && (
                <a
                  href={`mailto:${propertyManager.email}`}
                  className="inline-flex items-center gap-1 text-primary"
                  data-testid="pm-email-link"
                >
                  <i className="mdi mdi-email-outline text-sm" aria-hidden="true" />
                  {propertyManager.email}
                </a>
              )}
              {propertyManager.phone && (
                <a
                  href={`tel:${propertyManager.phone}`}
                  className="inline-flex items-center gap-1 text-success"
                  data-testid="pm-phone-link"
                >
                  <i className="mdi mdi-phone text-sm" aria-hidden="true" />
                  {propertyManager.phone}
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Payment */}
      {payment && (
        <section
          className="rounded-[20px] border border-black/[0.06] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
          data-testid="job-payment-section"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Payment</p>
          <p className="mt-1 text-lg font-bold text-text-primary">
            {formatCurrency(payment.amount, payment.currency)}
          </p>
        </section>
      )}

      {/* Inspection App Link */}
      {inspectionAppLink && (
        <a
          href={inspectionAppLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-[20px] border border-primary/20 bg-primary/5 px-4 py-3.5 text-sm font-bold text-primary shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
          data-testid="inspection-app-link"
        >
          <i className="mdi mdi-open-in-new text-base" aria-hidden="true" />
          {inspectionAppLink.label}
        </a>
      )}
    </div>
  );
}
