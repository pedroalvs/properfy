interface KeyDetailsSectionProps {
  keyRequired: boolean;
  meetingLocation: string | null;
  restrictions: string | null;
}

export function KeyDetailsSection({ keyRequired, meetingLocation, restrictions }: KeyDetailsSectionProps) {
  if (!keyRequired && !meetingLocation && !restrictions) return null;

  return (
    <section className="rounded-lg bg-card-bg p-4" data-testid="key-details-section">
      <h3 className="text-xs font-bold uppercase text-text-secondary">Details</h3>
      <div className="mt-2 flex flex-col gap-2 text-sm">
        {keyRequired && (
          <div className="flex items-center gap-2">
            <i className="mdi mdi-key text-base text-warning" aria-hidden="true" />
            <span className="font-semibold text-text-primary">Key required</span>
          </div>
        )}
        {meetingLocation && (
          <div className="flex items-start gap-2">
            <i className="mdi mdi-map-marker-radius text-base text-text-secondary" aria-hidden="true" />
            <span className="text-text-primary">{meetingLocation}</span>
          </div>
        )}
        {restrictions && (
          <div className="flex items-start gap-2">
            <i className="mdi mdi-alert-circle-outline text-base text-warning" aria-hidden="true" />
            <span className="text-text-primary">{restrictions}</span>
          </div>
        )}
      </div>
    </section>
  );
}
