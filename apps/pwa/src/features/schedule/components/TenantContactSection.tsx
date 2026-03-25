interface TenantContactSectionProps {
  name: string;
  phone: string | null;
  email: string | null;
}

export function TenantContactSection({ name, phone, email }: TenantContactSectionProps) {
  const hasContactDetails = Boolean(phone || email);

  return (
    <section className="rounded-lg bg-card-bg p-4" data-testid="tenant-contact-section">
      <h3 className="text-xs font-bold uppercase text-text-secondary">Tenant</h3>
      <p className="mt-1 text-sm font-semibold text-text-primary">{name}</p>
      <div className="mt-2 flex flex-col gap-1">
        {phone && (
          <a href={`tel:${phone}`} className="inline-flex items-center gap-2 text-sm text-primary">
            <i className="mdi mdi-phone text-base" aria-hidden="true" />
            {phone}
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className="inline-flex items-center gap-2 text-sm text-primary">
            <i className="mdi mdi-email-outline text-base" aria-hidden="true" />
            {email}
          </a>
        )}
        {!hasContactDetails && (
          <p className="text-sm text-text-muted">No contact details available.</p>
        )}
      </div>
    </section>
  );
}
