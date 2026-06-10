import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
import { useFormOptions } from '@/hooks/useFormOptions';
import { usePermissions } from '@/hooks/usePermissions';
import { TemplateFilters } from '../components/TemplateFilters';
import { TemplateTable } from '../components/TemplateTable';
import { TemplateFormDrawer } from '../components/TemplateFormDrawer';
import { useTemplateList } from '../hooks/useTemplateList';
import type { NotificationTemplate } from '../types';

export function NotificationTemplateListPage() {
  const {
    data,
    isLoading,
    isError,
    errorMessage,
    refetch,
    filters,
    setFilters,
  } = useTemplateList();

  const { hasRole } = usePermissions();
  const isGlobalRole = hasRole('AM', 'OP');

  // Cross-tenant roles (AM/OP) can filter templates by owning agency. Distinct
  // query-key so this tenant list does not collide with other pages' caches.
  const { options: tenantOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'notification-template-filter'],
    '/v1/tenants',
    (t) => ({ value: t.id, label: t.name }),
    undefined,
    { enabled: isGlobalRole },
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);

  const handleEdit = useCallback((template: NotificationTemplate) => {
    setSelectedTemplate(template);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedTemplate(null);
  }, []);

  const handleSaved = useCallback(() => {
    setDrawerOpen(false);
    setSelectedTemplate(null);
    refetch();
  }, [refetch]);

  return (
    <>
      <ListFilterTableTemplate title="Notification Templates">
        <TemplateFilters
          filters={filters}
          onFiltersChange={setFilters}
          tenantOptions={tenantOptions}
          showTenantFilter={isGlobalRole}
        />
        <TemplateTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load notification templates') : undefined}
          onRetryError={refetch}
          onEdit={handleEdit}
        />
      </ListFilterTableTemplate>

      <TemplateFormDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        template={selectedTemplate}
        onSaved={handleSaved}
      />
    </>
  );
}
