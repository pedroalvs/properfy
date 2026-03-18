import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { PricingRuleFilters } from '../components/PricingRuleFilters';
import { PricingRuleTable } from '../components/PricingRuleTable';
import { PricingRuleFormDrawer } from '../components/PricingRuleFormDrawer';
import { usePricingRuleList } from '../hooks/usePricingRuleList';
import type { PricingRule } from '../types';

export function PricingRuleListPage() {
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
  } = usePricingRuleList();

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
        }}
      >
        <PricingRuleFilters
          filters={filters}
          onFiltersChange={setFilters}
        />
        <PricingRuleTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load pricing rules') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          sorting={sorting}
          onEdit={handleEdit}
        />
      </ListFilterTableTemplate>
      <PricingRuleFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditRule(null);
        }}
        rule={editRule}
        onSaved={handleSaved}
      />
    </>
  );
}
