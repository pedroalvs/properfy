interface StatusChipProps {
  label: string;
  bg: string;
  text?: string;
  className?: string;
}

export function StatusChip({ label, bg, text = 'var(--color-text-primary)', className = '' }: StatusChipProps) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}
