import { useState, useCallback } from 'react';
import { ListFilterTableTemplate } from '@/components/layout/templates/ListFilterTableTemplate';
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
    pagination,
    sorting,
  } = useTemplateList();

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
        />
        <TemplateTable
          data={data}
          loading={isLoading}
          error={isError ? (errorMessage ?? 'Failed to load notification templates') : undefined}
          onRetryError={refetch}
          pagination={pagination}
          sorting={sorting}
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
