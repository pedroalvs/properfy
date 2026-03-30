interface KeyDetailsSectionProps {
  keyRequired: boolean;
  meetingLocation: string | null;
  restrictions: string | null;
}

export function KeyDetailsSection({ keyRequired, meetingLocation, restrictions }: KeyDetailsSectionProps) {
  if (!keyRequired && !meetingLocation && !restrictions) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="key-details-section">
      {keyRequired && (
        <section className="flex items-center gap-3 rounded-[20px] border border-warning/20 bg-warning/8 px-4 py-3.5">
          <i className="mdi mdi-key text-xl text-warning shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-warning">Key collection required</p>
            <p className="text-xs text-warning/80">Collect the key before attending the property.</p>
          </div>
        </section>
      )}

      {(meetingLocation || restrictions) && (
        <section
          className="overflow-hidden rounded-[20px] border border-black/[0.06] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
        >
          <div className="px-4 pt-4 pb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">On-site details</p>
            <div className="mt-2 flex flex-col gap-2.5 text-sm">
              {meetingLocation && (
                <div className="flex items-start gap-2">
                  <i className="mdi mdi-map-marker-radius mt-0.5 text-base text-text-secondary shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Meeting point</p>
                    <p className="text-sm text-text-primary">{meetingLocation}</p>
                  </div>
                </div>
              )}
              {restrictions && (
                <div className="flex items-start gap-2">
                  <i className="mdi mdi-alert-circle-outline mt-0.5 text-base text-warning shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Restrictions</p>
                    <p className="text-sm text-text-primary">{restrictions}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
