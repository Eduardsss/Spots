import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getAuthToken, setAuthToken } from "@/lib/api";
import type { User } from "@/types";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, profileImage?: string | null) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: { username?: string; profileImage?: string | null; password?: string }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => getAuthToken());
  const [loading, setLoading] = useState<boolean>(true);

  const loadProfile = useCallback(async () => {
    if (!getAuthToken()) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data } = await api.get<User>("/users/me");
      setUser(data);
    } catch (error) {
      console.error("Failed to load profile", error);
      setAuthToken(null);
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const login = useCallback(async (username: string, password: string) => {
    const { data } = await api.post<{ token: string; user: User }>("/auth/login", {
      username,
      password,
    });
    setAuthToken(data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (username: string, password: string, profileImage?: string | null) => {
      const { data } = await api.post<{ token: string; user: User }>("/auth/register", {
        username,
        password,
        profileImage,
      });
      setAuthToken(data.token);
      setToken(data.token);
      setUser(data.user);
    },
    []
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  const updateProfile = useCallback(
    async (updates: { username?: string; profileImage?: string | null; password?: string }) => {
      const { data } = await api.put<User>("/users/profile", {
        username: updates.username,
        profileImage: updates.profileImage,
        password: updates.password,
      });
      setUser(data);
    },
    []
  );

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, refreshProfile, updateProfile }),
    [user, token, loading, login, register, logout, refreshProfile, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
