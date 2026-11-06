import { create } from "zustand";

export interface User {
  id: string;
  username: string;
  email?: string;
}

interface UserState {
  token: string | null;
  user: User | null;
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  clear: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  token: null,
  user: null,
  setToken: (token) => set({ token }),
  setUser: (user) => set({ user }),
  clear: () => set({ token: null, user: null }),
}));
