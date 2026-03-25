import { getPasswordStrength } from '@/lib/validation';

const BAR_COLORS: Record<number, string> = {
  0: 'bg-text-muted',
  1: 'bg-error',
  2: 'bg-warning',
  3: 'bg-info',
  4: 'bg-success',
};

const LABEL_COLORS: Record<number, string> = {
  0: 'text-text-muted',
  1: 'text-error',
  2: 'text-warning',
  3: 'text-info',
  4: 'text-success',
};

interface PasswordStrengthIndicatorProps {
  password: string;
  confirmPassword?: string;
}

export function PasswordStrengthIndicator({
  password,
  confirmPassword,
}: PasswordStrengthIndicatorProps) {
  if (!password) return null;

  const { score, label } = getPasswordStrength(password);
  const showMismatch =
    confirmPassword !== undefined && confirmPassword.length > 0 && password !== confirmPassword;
  const showMatch =
    confirmPassword !== undefined && confirmPassword.length > 0 && password === confirmPassword;

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={`h-1 flex-1 rounded-full transition-colors ${
                score >= level ? BAR_COLORS[score] : 'bg-black/10'
              }`}
            />
          ))}
        </div>
        <span className={`text-xs font-medium ${LABEL_COLORS[score]}`}>{label}</span>
      </div>

      {showMismatch && (
        <p className="text-xs text-error">Passwords do not match</p>
      )}
      {showMatch && (
        <p className="text-xs text-success">Passwords match</p>
      )}
    </div>
  );
}
