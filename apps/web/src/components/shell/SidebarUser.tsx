import { useState } from 'react';
import { SidebarUserMenu } from './SidebarUserMenu';

export function SidebarUser() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative w-sidebar border-t border-black/5 bg-transparent py-3 text-center">
      <SidebarUserMenu open={open} onClose={() => setOpen(false)} />
      <button
        onClick={() => setOpen((v) => !v)}
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/5"
        aria-label="User menu"
        title="User menu"
      >
        <i className="mdi mdi-cog-outline text-xl opacity-65" />
      </button>
    </div>
  );
}
