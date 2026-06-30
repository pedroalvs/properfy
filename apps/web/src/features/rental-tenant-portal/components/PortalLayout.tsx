import type { ReactNode } from 'react';

interface PortalLayoutProps {
  children: ReactNode;
}

export function PortalLayout({ children }: PortalLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-app-bg">
      <header className="flex items-center justify-center py-6">
        <h1 className="text-2xl font-bold text-secondary">Properfy</h1>
      </header>

      <main className="mx-auto w-full max-w-[600px] flex-1 px-4 pb-8">
        {children}
      </main>

      <footer className="py-4 text-center text-xs text-text-muted">
        Properfy &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
