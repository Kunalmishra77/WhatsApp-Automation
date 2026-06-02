import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      clientId: null,
      user: null,
      clients: [],
      setToken: (token) => set({ token }),
      setClientId: (clientId) => set({ clientId }),
      setUser: (user) => set({ user }),
      setClients: (clients) => set({ clients }),
      logout: () => set({ token: null, clientId: null, user: null }),
    }),
    { name: 'pb-auth' }
  )
)
