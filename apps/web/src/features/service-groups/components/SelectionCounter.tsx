interface SelectionCounterProps {
  count: number;
  min?: number;
  max?: number;
}

export function SelectionCounter({ count, min = 5, max = 25 }: SelectionCounterProps) {
  const isOutOfRange = count < min || count > max;
  const textColor = isOutOfRange ? 'text-warning' : 'text-text-secondary';

  return (
    <div className={`flex items-center gap-1.5 text-sm font-semibold ${textColor}`} role="status">
      {isOutOfRange && (
        <i className="mdi mdi-alert-circle-outline text-base" aria-hidden="true" />
      )}
      <span>
        {count} selected (min {min}, max {max})
      </span>
    </div>
  );
}
