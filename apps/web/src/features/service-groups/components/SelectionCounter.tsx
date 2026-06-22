interface SelectionCounterProps {
  count: number;
}

export function SelectionCounter({ count }: SelectionCounterProps) {
  return (
    <div className="flex items-center gap-1.5 text-sm font-semibold text-text-secondary" role="status">
      <span>{count} selected</span>
    </div>
  );
}
