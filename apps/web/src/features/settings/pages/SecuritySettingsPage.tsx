import { Navigate } from 'react-router-dom';

/**
 * Security now lives as a tab on the account page (password, 2FA and sessions
 * in one place). This route is kept as a redirect so existing links and the
 * sidebar entry still resolve.
 */
export function SecuritySettingsPage() {
  return <Navigate to="/settings/account?tab=security" replace />;
}
