// frontend/src/application/store/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../../domain/models/Auth';

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
      hasPermission: (permission: string) => {
        const { user } = get();
        return user?.role.permissions.includes(permission) ?? false;
      },
    }),
    { name: 'auth-storage' }
  )
);