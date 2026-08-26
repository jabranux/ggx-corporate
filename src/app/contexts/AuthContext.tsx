import { createContext, useContext, useState, type ReactNode } from 'react';
import { loadState } from '../lib/storage';
import { logoutMockUser } from '../services/authService';

// Credentials are verified server-side (`POST /api/auth/login`, see
// `services/authService.ts` and `api/auth/login.ts`), which also sets the
// signed, httpOnly session cookie `/api/support/**` derives identity from.
// This context only holds the resulting UI-display state: role + scoped
// account id, consumed by route guards, nav, and notification visibility —
// forgeable like any client state, but not a security boundary.
//
// Session persistence is owned by `authService` (loginMockUser persists on a
// successful login; logoutMockUser clears it). This context keeps the React
// state + a synchronous localStorage read on init (avoids an auth-hydration
// flicker on refresh).

export type UserRole = 'admin' | 'manager';

export interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
  /** Canonical account id the user is scoped to: 'main' (Admin) or a subaccount id (Manager). */
  accountId: string;
  /** Display name for the scoped account. */
  accountName: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadState<AuthUser | null>('auth', null));

  // The session is persisted by authService.loginMockUser() before this is
  // called (see Login.tsx), so here we only update React state.
  const login = (u: AuthUser) => {
    setUser(u);
  };

  const logout = () => {
    setUser(null);
    void logoutMockUser();
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
