interface RentalTenantPortalCancelledViewProps {
  agencyPhone?: string;
}

export function RentalTenantPortalCancelledView({
  agencyPhone,
}: RentalTenantPortalCancelledViewProps) {
  return (
    <div className="rounded bg-card-bg p-8 text-center shadow-sm">
      <i className="mdi mdi-calendar-remove-outline mb-3 text-5xl text-error" />
      <h2 className="mb-2 text-lg font-bold text-text-primary">
        This inspection has been cancelled
      </h2>

      {agencyPhone && (
        <p className="mt-4 text-sm text-text-secondary">
          <i className="mdi mdi-phone mr-1 text-base text-secondary" />
          Questions? Contact the agency at{' '}
          <a
            href={`tel:${agencyPhone}`}
            className="font-semibold text-primary hover:underline"
          >
            {agencyPhone}
          </a>
        </p>
      )}
    </div>
  );
}
