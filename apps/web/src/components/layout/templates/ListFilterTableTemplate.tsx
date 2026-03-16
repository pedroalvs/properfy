import type { ReactNode } from 'react';
import { PageHeader, type PageHeaderAction } from '../PageHeader';
import { EntityListCard } from '@/components/data/EntityListCard';

/**
 * Template: List with Filters + Table
 *
 * Usage pattern:
 *   <ListFilterTableTemplate title="Vistorias" primaryAction={...}>
 *     <FilterBar>...</FilterBar>
 *     <DataTable ... />
 *   </ListFilterTableTemplate>
 */
interface ListFilterTableTemplateProps {
  title: string;
  primaryAction?: PageHeaderAction;
  secondaryActions?: PageHeaderAction[];
  children: ReactNode;
}

export function ListFilterTableTemplate({
  title,
  primaryAction,
  secondaryActions,
  children,
}: ListFilterTableTemplateProps) {
  return (
    <div>
      <PageHeader
        title={title}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
      />
      <EntityListCard>{children}</EntityListCard>
    </div>
  );
}
