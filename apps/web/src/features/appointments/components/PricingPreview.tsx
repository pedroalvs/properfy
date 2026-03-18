import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { PricingRule } from '@/features/pricing-rules/types';

interface PricingPreviewProps {
  branchId: string;
  serviceTypeId: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount);
}

function calculateInspectorPayout(rule: PricingRule): number {
  if (rule.payoutType === 'FIXED') {
    return rule.payoutValue;
  }
  return (rule.priceAmount * rule.payoutValue) / 100;
}

function calculatePlatformFee(rule: PricingRule): number {
  return rule.priceAmount - calculateInspectorPayout(rule);
}

function PricingPreviewSkeleton() {
  return (
    <div className="animate-pulse rounded bg-card-bg p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" role="status" aria-label="Loading pricing">
      <div className="mb-3 h-4 w-32 rounded bg-black/5" />
      <div className="space-y-2">
        <div className="flex justify-between">
          <div className="h-3 w-20 rounded bg-black/5" />
          <div className="h-3 w-16 rounded bg-black/5" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 w-24 rounded bg-black/5" />
          <div className="h-3 w-16 rounded bg-black/5" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 w-20 rounded bg-black/5" />
          <div className="h-3 w-16 rounded bg-black/5" />
        </div>
      </div>
    </div>
  );
}

export function PricingPreview({ branchId, serviceTypeId }: PricingPreviewProps) {
  const enabled = !!branchId && !!serviceTypeId;

  const { data: response, isLoading, isError } = usePaginatedQuery<PricingRule>(
    ['pricing-rules', 'preview', branchId, serviceTypeId],
    '/v1/pricing-rules',
    { branchId, serviceTypeId, pageSize: 1 },
    { enabled },
  );

  if (!enabled) {
    return null;
  }

  if (isLoading) {
    return <PricingPreviewSkeleton />;
  }

  if (isError) {
    return (
      <div className="rounded bg-card-bg p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
        <p className="text-sm text-error">Failed to load pricing information</p>
      </div>
    );
  }

  const rule = response?.data?.[0];

  if (!rule) {
    return (
      <div className="rounded bg-card-bg p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
        <p className="text-sm text-text-muted">No pricing rule found</p>
      </div>
    );
  }

  const inspectorPayout = calculateInspectorPayout(rule);
  const platformFee = calculatePlatformFee(rule);

  return (
    <div className="rounded bg-card-bg p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
      <h4 className="mb-3 text-sm font-bold text-text-secondary">Pricing</h4>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-primary">Base Price</span>
          <span className="text-sm font-medium text-text-primary" data-testid="base-price">
            {formatCurrency(rule.priceAmount)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-primary">Inspector Payout</span>
          <span className="text-sm font-medium text-text-primary" data-testid="inspector-payout">
            {formatCurrency(inspectorPayout)}
            {rule.payoutType === 'PERCENTAGE' && (
              <span className="ml-1 text-xs text-text-muted">({rule.payoutValue}%)</span>
            )}
          </span>
        </div>
        <div className="my-1 border-t border-black/5" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-secondary">Platform Fee</span>
          <span className="text-sm font-bold text-secondary" data-testid="platform-fee">
            {formatCurrency(platformFee)}
          </span>
        </div>
      </div>
    </div>
  );
}
