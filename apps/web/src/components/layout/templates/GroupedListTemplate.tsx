import type { ReactNode } from 'react';
import { PageHeader, type PageHeaderAction } from '../PageHeader';

/**
 * Template: Grouped List
 *
 * Usage pattern:
 *   <GroupedListTemplate title="Financeiro">
 *     <PageSectionHeader title="Março 2025" count={12} />
 *     <EntityListCard>...</EntityListCard>
 *     <PageSectionHeader title="Fevereiro 2025" count={8} />
 *     <EntityListCard>...</EntityListCard>
 *   </GroupedListTemplate>
 */
interface GroupedListTemplateProps {
  title: string;
  primaryAction?: PageHeaderAction;
  secondaryActions?: PageHeaderAction[];
  children: ReactNode;
}

export function GroupedListTemplate({
  title,
  primaryAction,
  secondaryActions,
  children,
}: GroupedListTemplateProps) {
  return (
    <div>
      <PageHeader
        title={title}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
      />
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}
