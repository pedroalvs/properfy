import { StatCard } from './StatCard';

interface DashboardSummaryCardsProps {
  draft: number;
  awaitingInspector: number;
  scheduled: number;
  doneThisMonth: number;
}

export function DashboardSummaryCards({
  draft,
  awaitingInspector,
  scheduled,
  doneThisMonth,
}: DashboardSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon="mdi-file-edit-outline"
        value={draft}
        label="Rascunho"
        colorClass="border-l-[#E1BEE7]"
        iconColorClass="text-[#CE93D8]"
      />
      <StatCard
        icon="mdi-clock-outline"
        value={awaitingInspector}
        label="Aguardando Inspetor"
        colorClass="border-l-[#FFE0B2]"
        iconColorClass="text-warning"
      />
      <StatCard
        icon="mdi-calendar-check"
        value={scheduled}
        label="Agendadas"
        colorClass="border-l-[#B3E5FC]"
        iconColorClass="text-info"
      />
      <StatCard
        icon="mdi-check-circle-outline"
        value={doneThisMonth}
        label="Concluídas este mês"
        colorClass="border-l-[#C8E6C9]"
        iconColorClass="text-success"
      />
    </div>
  );
}
