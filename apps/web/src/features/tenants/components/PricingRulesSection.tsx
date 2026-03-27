import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { FilterBar } from '@/components/filters/FilterBar';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { PricingRuleTable } from '@/features/pricing-rules/components/PricingRuleTable';
import { PricingRuleFormDrawer } from '@/features/pricing-rules/components/PricingRuleFormDrawer';
import { usePricingRuleList } from '@/features/pricing-rules/hooks/usePricingRuleList';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { SERVICE_TYPE_STATUS_MAP } from '@/lib/status-colors';
import type { PricingRule } from '@/features/pricing-rules/types';

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  ...Object.entries(SERVICE_TYPE_STATUS_MAP).map(([value, config]) => ({
    label: config.label,
    value,
  })),
];

interface PricingRulesSectionProps {
  tenantId: string;
  tenantName: string;
  currency: string;
}

export function PricingRulesSection({ tenantId, tenantName, currency }: PricingRulesSectionProps) {
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
    sorting,
  } = usePricingRuleList({ tenantId });

  const { data: serviceTypesResp } = usePaginatedQuery<{ id: string; name: string }>(
    ['service-types-options'],
    '/v1/service-types',
    { page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc' },
  );
  const { data: branchesResp } = usePaginatedQuery<{ id: string; name: string }>(
    ['branches-options', tenantId],
    '/v1/branches',
    { page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc', tenantId },
  );

  const serviceTypeOptions = useMemo(
    () => [
      { value: '', label: 'All' },
      ...(serviceTypesResp?.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    ],
    [serviceTypesResp],
  );
  const branchOptions = useMemo(
    () => [
      { value: '', label: 'All' },
      ...(branchesResp?.data ?? []).map((b) => ({ value: b.id, label: b.name })),
    ],
    [branchesResp],
  );

  const serviceTypeMap = useMemo(
    () => Object.fromEntries((serviceTypesResp?.data ?? []).map((s) => [s.id, s.name])),
    [serviceTypesResp],
  );
  const branchMap = useMemo(
    () => Object.fromEntries((branchesResp?.data ?? []).map((b) => [b.id, b.name])),
    [branchesResp],
  );

  const enrichedData = useMemo(
    () =>
      data.map((rule) => ({
        ...rule,
        tenantName,
        serviceTypeName: serviceTypeMap[rule.serviceTypeId],
        branchName: rule.branchId ? branchMap[rule.branchId] : null,
      })),
    [data, tenantName, serviceTypeMap, branchMap],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editRule, setEditRule] = useState<PricingRule | null>(null);

  const handleEdit = useCallback((rule: PricingRule) => {
    setEditRule(rule);
    setFormOpen(true);
  }, []);

  const handleSaved = useCallback(() => {
    setFormOpen(false);
    setEditRule(null);
    refetch();
  }, [refetch]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-secondary">Pricing Rules</h3>
        <Button
          variant="primary"
          onClick={() => { setEditRule(null); setFormOpen(true); }}
        >
          <i className="mdi mdi-plus" aria-hidden="true" /> New Rule
        </Button>
      </div>

      <div className="mt-4">
        <FilterBar>
          <FilterSelect
            label="Service Type"
            value={filters.serviceTypeId ?? ''}
            onChange={(serviceTypeId) => setFilters((prev) => ({ ...prev, serviceTypeId }))}
            options={serviceTypeOptions}
          />
          <FilterSelect
            label="Branch"
            value={filters.branchId ?? ''}
            onChange={(branchId) => setFilters((prev) => ({ ...prev, branchId }))}
            options={branchOptions}
          />
          <FilterSelect
            label="Status"
            value={filters.status ?? ''}
            onChange={(status) => setFilters((prev) => ({ ...prev, status }))}
            options={STATUS_OPTIONS}
          />
        </FilterBar>
      </div>

      <div className="mt-4">
        <PricingRuleTable
          data={enrichedData}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load pricing rules') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          sorting={sorting}
          onEdit={handleEdit}
        />
      </div>

      <PricingRuleFormDrawer
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditRule(null); }}
        rule={editRule}
        onSaved={handleSaved}
        defaultTenantId={tenantId}
        tenantOptions={[{ value: tenantId, label: tenantName }]}
        serviceTypeOptions={serviceTypeOptions.filter((o) => o.value !== '')}
        branchOptions={branchOptions.filter((o) => o.value !== '')}
      />
    </>
  );
}
