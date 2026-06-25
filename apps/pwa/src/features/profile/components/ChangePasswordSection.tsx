import { useState, type FormEvent } from 'react';
import { useChangePassword } from '../hooks/useChangePassword';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (password.length < 8) return { score: 0, label: 'Too short', color: 'bg-gray-300' };
  let points = 0;
  if (/[a-z]/.test(password)) points++;
  if (/[A-Z]/.test(password)) points++;
  if (/\d/.test(password)) points++;
  if (/[^a-zA-Z\d]/.test(password)) points++;
  if (password.length >= 12) points++;
  if (points <= 1) return { score: 1, label: 'Weak', color: 'bg-error' };
  if (points === 2) return { score: 2, label: 'Fair', color: 'bg-warning' };
  if (points === 3) return { score: 3, label: 'Good', color: 'bg-info' };
  return { score: 4, label: 'Strong', color: 'bg-success' };
}

export function ChangePasswordSection() {
  const { changePassword, isSubmitting } = useChangePassword();
  const { logout } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-between rounded-2xl bg-white p-4 text-left shadow-sm"
      >
        <div className="flex items-center gap-3">
          <i className="mdi mdi-lock-outline text-xl text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">Change Password</span>
        </div>
        <i className="mdi mdi-chevron-right text-xl text-text-muted" />
      </button>
    );
  }

  const strength = getPasswordStrength(newPwd);
  const mismatch = confirm.length > 0 && newPwd !== confirm;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    if (!current || !newPwd || !confirm) { setError('All fields are required'); return; }
    if (newPwd !== confirm) { setError('Passwords do not match'); return; }
    if (newPwd.length < 8) { setError('Password must be at least 8 characters'); return; }
    try {
      await changePassword(current, newPwd);
      setSuccess(true);
      setCurrent(''); setNewPwd(''); setConfirm('');
      setTimeout(() => {
        setExpanded(false);
        setSuccess(false);
        logout();
      }, 1500);
    } catch (err: any) {
      setError(err.message ?? 'Failed to change password');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <i className="mdi mdi-lock-outline text-xl text-text-secondary" />
          <span className="text-sm font-semibold text-text-primary">Change Password</span>
        </div>
        <button type="button" onClick={() => setExpanded(false)} className="text-sm text-text-muted">Cancel</button>
      </div>

      <div className="mt-4 space-y-3">
        {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}
        {success && <p className="rounded-xl bg-success/10 px-3 py-2 text-xs text-success">Password changed successfully. You will be asked to sign in again.</p>}

        <input
          type="password"
          placeholder="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          className="h-11 w-full rounded-xl border border-black/10 bg-app-bg/60 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <div>
          <input
            type="password"
            placeholder="New password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            autoComplete="new-password"
            className="h-11 w-full rounded-xl border border-black/10 bg-app-bg/60 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {newPwd && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3, 4].map((l) => (
                  <div key={l} className={`h-1 flex-1 rounded-full ${strength.score >= l ? strength.color : 'bg-black/10'}`} />
                ))}
              </div>
              <span className="text-[11px] font-medium text-text-muted">{strength.label}</span>
            </div>
          )}
        </div>
        <div>
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="h-11 w-full rounded-xl border border-black/10 bg-app-bg/60 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {mismatch && <p className="mt-1 text-xs text-error">Passwords do not match</p>}
          {confirm && !mismatch && newPwd === confirm && <p className="mt-1 text-xs text-success">Passwords match</p>}
        </div>

        <Button type="submit" loading={isSubmitting} className="!w-full !rounded-xl">
          Update Password
        </Button>
      </div>
    </form>
  );
}
