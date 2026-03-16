import type { ReactNode } from 'react';

interface DrawerHeaderProps {
  title: string;
  onClose: () => void;
  actions?: ReactNode;
}

export function DrawerHeader({ title, onClose, actions }: DrawerHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-black/10 px-6 py-4">
      <h2 className="text-dialog-title text-text-primary">{title}</h2>
      <div className="flex items-center gap-2">
        {actions}
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
          aria-label="Fechar"
        >
          <i className="mdi mdi-close text-xl" />
        </button>
      </div>
    </div>
  );
}
