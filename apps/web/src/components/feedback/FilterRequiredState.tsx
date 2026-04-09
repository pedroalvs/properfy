interface FilterRequiredStateProps {
  message?: string;
}

export function FilterRequiredState({
  message = 'Select filters to view data.',
}: FilterRequiredStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" role="status">
      <i className="mdi mdi-filter-outline text-[48px] text-text-muted" aria-hidden="true" />
      <p className="mt-4 text-base font-semibold text-text-primary">{message}</p>
    </div>
  );
}
