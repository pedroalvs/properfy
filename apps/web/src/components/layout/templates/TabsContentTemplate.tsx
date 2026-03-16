import type { ReactNode } from 'react';
import { PageHeader, type PageHeaderAction } from '../PageHeader';
import { TabsNav } from '../TabsNav';

/**
 * Template: Tabs + Content
 *
 * Usage pattern:
 *   <TabsContentTemplate title="Detalhes" tabs={...} activeTab={...} onTabChange={...}>
 *     {activeTab === 'geral' && <GeneralPanel />}
 *     {activeTab === 'financeiro' && <FinancePanel />}
 *   </TabsContentTemplate>
 */
interface Tab {
  id: string;
  label: string;
  badge?: number;
}

interface TabsContentTemplateProps {
  title: string;
  primaryAction?: PageHeaderAction;
  secondaryActions?: PageHeaderAction[];
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children: ReactNode;
}

export function TabsContentTemplate({
  title,
  primaryAction,
  secondaryActions,
  tabs,
  activeTab,
  onTabChange,
  children,
}: TabsContentTemplateProps) {
  return (
    <div>
      <PageHeader
        title={title}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
      />
      <TabsNav tabs={tabs} activeTab={activeTab} onChange={onTabChange} />
      <div role="tabpanel" className="mt-4">
        {children}
      </div>
    </div>
  );
}
