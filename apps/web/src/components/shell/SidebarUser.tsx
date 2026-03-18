import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function SidebarUser() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="w-sidebar border-t border-black/5 bg-transparent py-3 text-center">
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => navigate('/settings/account')}
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/5"
          aria-label="Settings"
          title="Settings"
        >
          <i className="mdi mdi-cog-outline text-xl opacity-65" />
        </button>
        <button
          onClick={logout}
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/5"
          aria-label="Log out"
          title="Log out"
        >
          <i className="mdi mdi-account-circle-outline text-2xl opacity-65" />
        </button>
      </div>
    </div>
  );
}
