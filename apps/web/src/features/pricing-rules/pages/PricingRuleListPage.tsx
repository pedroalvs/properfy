import { useState, useCallback, useMemo, useEffect } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { useAuth } from '@/hooks/useAuth';
import { PricingRuleFilters } from '../components/PricingRuleFilters';
import { PricingRuleTable } from '../components/PricingRuleTable';
import { PricingRuleFormDrawer } from '../components/PricingRuleFormDrawer';
import { usePricingRuleList } from '../hooks/usePricingRuleList';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { FilterRequiredState } from '@/components/feedback/FilterRequiredState';
import type { PricingRule } from '../types';

export function PricingRuleListPage() {
  const { user } = useAuth();
  const isGlobalRole = user?.role === 'AM' || user?.role === 'OP';
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
    pagination,
  } = usePricingRuleList();

  const { data: tenantsResp } = usePaginatedQuery<{ id: string; name: string }>(
    ['tenants-options'],
    '/v1/tenants',
    { page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc' },
  );
  const { data: serviceTypesResp } = usePaginatedQuery<{ id: string; name: string }>(
    ['service-types-options'],
    '/v1/service-types',
    { page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc' },
  );
  const activeTenantId = filters.tenantId || null;
  const requiresTenantSelection = isGlobalRole && !activeTenantId;
  const { data: branchesResp } = usePaginatedQuery<{ id: string; name: string }>(
    ['branches-options', activeTenantId ?? ''],
    '/v1/branches',
    { page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc', tenantId: activeTenantId ?? undefined },
    { enabled: !!activeTenantId },
  );

  const tenantOptions = useMemo(
    () => [
      { value: '', label: 'All' },
      ...(tenantsResp?.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    ],
    [tenantsResp],
  );

  // Auto-select the first tenant for AM/OP so the page shows data immediately
  useEffect(() => {
    if (isGlobalRole && !filters.tenantId && tenantsResp?.data?.length) {
      setFilters((prev) => ({ ...prev, tenantId: tenantsResp.data[0]!.id }));
    }
  }, [isGlobalRole, filters.tenantId, tenantsResp, setFilters]);
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

  const tenantMap = useMemo(
    () => Object.fromEntries((tenantsResp?.data ?? []).map((t) => [t.id, t.name])),
    [tenantsResp],
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
        tenantName: tenantMap[rule.tenantId],
        serviceTypeName: serviceTypeMap[rule.serviceTypeId],
        branchName: rule.branchId ? branchMap[rule.branchId] : null,
      })),
    [data, tenantMap, serviceTypeMap, branchMap],
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
      <ListFilterTableTemplate
        title="Pricing Rules"
        primaryAction={{
          label: 'New Pricing Rule',
          icon: 'mdi-plus',
          onClick: () => {
            setEditRule(null);
            setFormOpen(true);
          },
          disabled: requiresTenantSelection,
        }}
      >
        <PricingRuleFilters
          filters={filters}
          onFiltersChange={setFilters}
          tenantOptions={tenantOptions}
          serviceTypeOptions={serviceTypeOptions}
          branchOptions={branchOptions}
        />
        {requiresTenantSelection ? (
          <FilterRequiredState message="Select an agency to view pricing rules." />
        ) : (
          <PricingRuleTable
            data={enrichedData}
            loading={isLoading}
            error={isError ? (errorMessage ?? 'Failed to load pricing rules') : undefined}
            onRetryError={refetch}
            pagination={pagination}
            onEdit={handleEdit}
          />
        )}
      </ListFilterTableTemplate>
      <PricingRuleFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditRule(null);
        }}
        rule={editRule}
        onSaved={handleSaved}
        defaultTenantId={editRule ? undefined : activeTenantId ?? undefined}
        tenantOptions={tenantOptions}
        serviceTypeOptions={serviceTypeOptions}
        branchOptions={branchOptions}
      />
    </>
  );
}
