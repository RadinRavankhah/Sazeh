import { create } from "zustand"

import { api } from "@/lib/api"

export interface Workspace {
  id: string
  name: string
  slug: string
  plan: string
  credits_balance: number
}

export interface CurrentUser {
  id: string
  email: string
  username: string
  first_name: string
  last_name: string
  default_workspace: Workspace | null
}

interface AuthState {
  user: CurrentUser | null
  status: "loading" | "authenticated" | "anonymous"
  hydrate: () => Promise<void>
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "loading",
  hydrate: async () => {
    try {
      const user = await api<CurrentUser>("/api/v1/me/")
      set({ user, status: "authenticated" })
    } catch {
      set({ user: null, status: "anonymous" })
    }
  },
  clear: () => set({ user: null, status: "anonymous" }),
}))
