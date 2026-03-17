interface BooleanIconProps {
  value: boolean;
  className?: string;
}

export function BooleanIcon({ value, className = '' }: BooleanIconProps) {
  return value ? (
    <i
      className={`mdi mdi-check-bold text-lg text-success ${className}`}
      aria-label="Yes"
      role="img"
    />
  ) : (
    <i
      className={`mdi mdi-close-thick text-lg text-error ${className}`}
      aria-label="No"
      role="img"
    />
  );
}
