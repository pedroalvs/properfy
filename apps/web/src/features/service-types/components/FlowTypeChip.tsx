import { FLOW_TYPE_MAP } from '@/lib/status-colors';

interface FlowTypeChipProps {
  flowType: string;
  className?: string;
}

export function FlowTypeChip({ flowType, className = '' }: FlowTypeChipProps) {
  const style = FLOW_TYPE_MAP[flowType as keyof typeof FLOW_TYPE_MAP];
  if (!style) return <span>{flowType}</span>;

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
