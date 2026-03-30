interface TenantContactSectionProps {
  name: string;
  phone: string | null;
  email: string | null;
}

export function TenantContactSection({ name, phone, email }: TenantContactSectionProps) {
  const hasContactDetails = Boolean(phone || email);

  return (
    <section
      className="overflow-hidden rounded-[20px] border border-black/[0.06] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
      data-testid="tenant-contact-section"
    >
      <div className="px-4 pt-4 pb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Tenant</p>
        <p className="mt-1 text-sm font-semibold text-text-primary">{name}</p>
        {!hasContactDetails && (
          <p className="mt-1 text-xs text-text-muted">No contact details available.</p>
        )}
      </div>

      {hasContactDetails && (
        <div className={`grid border-t border-black/[0.06] ${phone && email ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {phone && (
            <a
              href={`tel:${phone}`}
              className={`flex min-h-touch items-center justify-center gap-2 bg-success/5 px-4 py-3 text-sm font-bold text-success ${phone && email ? 'border-r border-black/[0.06]' : ''}`}
              data-testid="tenant-phone-link"
            >
              <i className="mdi mdi-phone text-base" aria-hidden="true" />
              Call tenant
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="flex min-h-touch items-center justify-center gap-2 bg-primary/5 px-4 py-3 text-sm font-bold text-primary"
              data-testid="tenant-email-link"
            >
              <i className="mdi mdi-email-outline text-base" aria-hidden="true" />
              Send email
            </a>
          )}
        </div>
      )}
    </section>
  );
}
