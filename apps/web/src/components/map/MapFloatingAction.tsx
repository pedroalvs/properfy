interface MapFloatingActionProps {
  actions: {
    icon: string;
    label: string;
    onClick: () => void;
    active?: boolean;
  }[];
  position?: 'top-right' | 'bottom-right';
}

export function MapFloatingAction({
  actions,
  position = 'bottom-right',
}: MapFloatingActionProps) {
  const positionClass =
    position === 'top-right' ? 'top-4 right-4' : 'bottom-4 right-4';

  return (
    <div
      className={`absolute ${positionClass} z-10 flex flex-col gap-2`}
      data-testid="map-floating-action"
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-shadow hover:shadow-xl ${action.active ? 'bg-primary text-white' : 'bg-card-bg'}`}
          aria-label={action.label}
          title={action.label}
        >
          <i className={`mdi ${action.icon} text-lg ${action.active ? 'text-white' : 'text-secondary'}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
