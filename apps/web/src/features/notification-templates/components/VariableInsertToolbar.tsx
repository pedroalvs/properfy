import { ALLOWED_VARIABLES } from '../types';

interface VariableInsertToolbarProps {
  onInsert: (variable: string) => void;
  disabled?: boolean;
}

export function VariableInsertToolbar({ onInsert, disabled }: VariableInsertToolbarProps) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded bg-[#F5F5F5] p-2" role="toolbar" aria-label="Insert variable">
      <span className="mr-1 self-center text-xs font-semibold text-text-secondary">Variables:</span>
      {ALLOWED_VARIABLES.map((variable) => (
        <button
          key={variable}
          type="button"
          disabled={disabled}
          onClick={() => onInsert(`{{${variable}}}`)}
          className={`rounded border border-[#E0E0E0] bg-white px-2 py-0.5 text-xs font-medium text-text-primary transition-colors
            ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:border-primary hover:bg-primary/5'}`}
          aria-label={`Insert ${variable}`}
        >
          {variable}
        </button>
      ))}
    </div>
  );
}
