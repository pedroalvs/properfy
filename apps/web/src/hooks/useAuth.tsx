import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const login = useCallback(async (_email: string, _password: string) => {
    // TODO: integrate with backend auth API
    setUser({
      id: 'stub-user-id',
      name: 'Admin',
      email: _email,
      role: 'AM',
      tenantId: null,
    });
    setToken('stub-token');
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: user !== null,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
