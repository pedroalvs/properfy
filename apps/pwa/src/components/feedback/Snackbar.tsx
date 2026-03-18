import { useSnackbar } from '@/hooks/useSnackbar';

const typeStyles: Record<string, string> = {
  success: 'bg-success text-white',
  error: 'bg-snackbar-error text-white',
  info: 'bg-info text-white',
};

const typeIcons: Record<string, string> = {
  success: 'mdi-check-circle',
  error: 'mdi-alert-circle',
  info: 'mdi-information',
};

export function Snackbar() {
  const { messages, dismiss } = useSnackbar();

  if (messages.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[100] flex flex-col gap-2" data-testid="snackbar-container">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex items-start gap-3 rounded px-4 py-3 shadow-lg ${typeStyles[msg.type]}`}
          role="alert"
        >
          <i className={`mdi ${typeIcons[msg.type]} mt-0.5 text-lg`} />
          <span className="flex-1 text-sm">{msg.message}</span>
          <button
            onClick={() => dismiss(msg.id)}
            className="ml-2 flex-shrink-0 opacity-70 hover:opacity-100"
            aria-label="Close"
          >
            <i className="mdi mdi-close text-base" />
          </button>
        </div>
      ))}
    </div>
  );
}
