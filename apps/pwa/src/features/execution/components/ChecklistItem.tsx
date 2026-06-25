import type { ChecklistTemplateItem, ChecklistResponse } from '../types';

interface ChecklistItemProps {
  item: ChecklistTemplateItem;
  response: ChecklistResponse | undefined;
  onChange: (response: ChecklistResponse) => void;
}

export function ChecklistItem({ item, response, onChange }: ChecklistItemProps) {
  const value = response?.value ?? null;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-card-bg p-3" data-testid={`checklist-item-${item.id}`}>
      <div className="flex items-start gap-2">
        <span className="text-sm font-medium text-text-primary">{item.label}</span>
        {item.required && <span className="text-xs text-error">*</span>}
      </div>

      {item.type === 'BOOLEAN' && (
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ itemId: item.id, value: true })}
            className={`flex min-h-touch flex-1 items-center justify-center gap-1 rounded-lg border text-sm font-semibold transition-colors ${
              value === true
                ? 'border-success bg-success/10 text-success'
                : 'border-border-subtle text-text-secondary'
            }`}
            data-testid={`checklist-${item.id}-yes`}
          >
            <i className="mdi mdi-check" /> Yes
          </button>
          <button
            onClick={() => onChange({ itemId: item.id, value: false })}
            className={`flex min-h-touch flex-1 items-center justify-center gap-1 rounded-lg border text-sm font-semibold transition-colors ${
              value === false
                ? 'border-error bg-error/10 text-error'
                : 'border-border-subtle text-text-secondary'
            }`}
            data-testid={`checklist-${item.id}-no`}
          >
            <i className="mdi mdi-close" /> No
          </button>
        </div>
      )}

      {item.type === 'TEXT' && (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange({ itemId: item.id, value: e.target.value })}
          placeholder="Enter details..."
          className="min-h-[80px] w-full rounded-lg border border-border-subtle bg-app-bg p-3 text-sm text-text-primary outline-none focus:border-primary"
          data-testid={`checklist-${item.id}-text`}
        />
      )}

      {item.type === 'RATING' && (
        <div className="flex gap-1" data-testid={`checklist-${item.id}-rating`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => onChange({ itemId: item.id, value: star })}
              className={`flex min-h-touch min-w-touch items-center justify-center text-xl ${
                typeof value === 'number' && star <= value
                  ? 'text-warning'
                  : 'text-text-disabled'
              }`}
              aria-label={`${star} star${star > 1 ? 's' : ''}`}
            >
              <i className="mdi mdi-star" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
