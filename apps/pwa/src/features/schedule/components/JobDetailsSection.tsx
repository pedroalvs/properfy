import { ExternalLink, KeyRound, Mail, Navigation, Phone } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import type { JobDetails } from '../types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { buttonVariants } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/format-currency';

interface JobDetailsSectionProps {
  jobDetails: JobDetails;
}

export function JobDetailsSection({ jobDetails }: JobDetailsSectionProps) {
  const {
    agency,
    keys,
    keyLocation,
    propertyManager,
    payment,
    inspectionAppLink,
  } = jobDetails;

  return (
    <div className="flex flex-col gap-3" data-testid="job-details-section">
      {/* Agency */}
      {agency && (
        <Card>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Agency</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{agency.name}</p>
          {agency.branchName && (
            <p className="mt-0.5 text-xs text-muted-foreground" data-testid="job-agency-branch">
              {agency.branchName}
            </p>
          )}
        </Card>
      )}

      {/* Tenant contacts render in the page-level ContactsSection (no duplication here). */}

      {/* Keys */}
      {keys.keyRequired && (
        <section
          className="overflow-hidden rounded-card border border-warning/20 bg-warning/8 shadow-sm"
          data-testid="job-keys-section"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <KeyRound className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <Badge tone="amber">Key required</Badge>
              {keys.keyLocation && (
                <p className="mt-1 text-sm text-foreground">{keys.keyLocation}</p>
              )}
            </div>
          </div>
          {keyLocation?.mapLinkUrl && (
            <a
              href={keyLocation.mapLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 border-t border-warning/20 bg-warning/5 px-4 py-3 text-sm font-bold text-warning"
              data-testid="key-location-map-link"
            >
              <Navigation className="h-4 w-4" aria-hidden="true" />
              Open in Maps
            </a>
          )}
        </section>
      )}

      {/* Property Manager */}
      {propertyManager && (propertyManager.name || propertyManager.email || propertyManager.phone) && (
        <Card className="overflow-hidden" data-testid="job-property-manager">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Property Manager</p>
          {propertyManager.name && (
            <p className="mt-1 text-sm font-semibold text-foreground">{propertyManager.name}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
            {propertyManager.email && (
              <a
                href={`mailto:${propertyManager.email}`}
                className="inline-flex items-center gap-1 text-primary"
                data-testid="pm-email-link"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {propertyManager.email}
              </a>
            )}
            {propertyManager.phone && (
              <a
                href={`tel:${propertyManager.phone}`}
                className="inline-flex items-center gap-1 text-success"
                data-testid="pm-phone-link"
              >
                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {propertyManager.phone}
              </a>
            )}
          </div>
        </Card>
      )}

      {/* Payment */}
      {payment && (
        <Card data-testid="job-payment-section">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Payment</p>
          <p className="mt-1 text-lg font-bold text-foreground">
            {formatCurrency(payment.payoutAmount, payment.currency)}
          </p>
        </Card>
      )}

      {/* Inspection App Link */}
      {inspectionAppLink && (
        <a
          href={inspectionAppLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outlined', block: true }))}
          data-testid="inspection-app-link"
        >
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
          {inspectionAppLink.label}
        </a>
      )}
    </div>
  );
}
