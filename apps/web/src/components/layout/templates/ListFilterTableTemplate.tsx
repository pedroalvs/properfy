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
  /** Parent screen for the header Back button, forwarded to PageHeader. */
  backTo?: string;
  children: ReactNode;
}

export function ListFilterTableTemplate({
  title,
  primaryAction,
  secondaryActions,
  backTo,
  children,
}: ListFilterTableTemplateProps) {
  return (
    <div>
      <PageHeader
        title={title}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        backTo={backTo}
      />
      <EntityListCard>
        <div className="flex flex-col gap-0">{children}</div>
      </EntityListCard>
    </div>
  );
}
