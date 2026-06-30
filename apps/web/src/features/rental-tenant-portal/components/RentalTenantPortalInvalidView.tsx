export function RentalTenantPortalInvalidView() {
  return (
    <div className="rounded bg-card-bg p-8 text-center shadow-sm">
      <i className="mdi mdi-alert-outline mb-3 text-5xl text-warning" />
      <h2 className="mb-2 text-lg font-bold text-text-primary">
        This link is no longer valid
      </h2>
      <p className="text-sm text-text-secondary">
        Please contact the agency for a new link.
      </p>
    </div>
  );
}
