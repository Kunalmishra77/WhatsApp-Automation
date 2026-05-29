import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { JWTClaims, UserRole, Permission } from '@/types/auth.types';
import { hasPermission } from '@/types/auth.types';

interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
}

interface AuthState {
  user: User | null;
  claims: JWTClaims | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setClaims: (claims: JWTClaims | null) => void;
  setLoading: (loading: boolean) => void;
  can: (permission: Permission) => boolean;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, get) => ({
      user:            null,
      claims:          null,
      isLoading:       true,
      isAuthenticated: false,

      setUser: (user) =>
        set({ user, isAuthenticated: user !== null }, false, 'auth/setUser'),

      setClaims: (claims) =>
        set({ claims }, false, 'auth/setClaims'),

      setLoading: (isLoading) =>
        set({ isLoading }, false, 'auth/setLoading'),

      can: (permission: Permission): boolean => {
        const { claims } = get();
        if (!claims) return false;
        return hasPermission(claims.role as UserRole, permission);
      },

      reset: () =>
        set(
          { user: null, claims: null, isAuthenticated: false, isLoading: false },
          false,
          'auth/reset'
        ),
    }),
    { name: 'AuthStore' }
  )
);
