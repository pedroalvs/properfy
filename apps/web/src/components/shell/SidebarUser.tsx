import { useAuth } from '@/hooks/useAuth';

export function SidebarUser() {
  const { user, logout } = useAuth();

  return (
    <div className="w-sidebar border-t border-black/5 bg-transparent py-3 text-center">
      <button
        onClick={logout}
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/5"
        aria-label={user?.name ?? 'Perfil'}
        title={user?.name ?? 'Perfil'}
      >
        <i className="mdi mdi-account-circle-outline text-2xl opacity-65" />
      </button>
    </div>
  );
}
