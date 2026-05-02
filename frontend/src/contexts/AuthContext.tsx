import React, { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

interface AuthContextType {
  user: any | null;
  roles: string[];
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signUp: (username: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const { data } = await api.get("/auth/me");
      if (data.user) {
        setUser(data.user);
        setRoles(data.roles || []);
      } else {
        setUser(null);
        setRoles([]);
      }
    } catch (e) {
      setUser(null);
      setRoles([]);
      localStorage.removeItem('auth_token');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const signIn = async (username: string, password: string) => {
    try {
      const { data } = await api.post("/auth/login", { username, password });
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
      }
      await refreshUser();
      return { error: null };
    } catch (e: any) {
      return { error: e.response?.data?.error || "Login failed" };
    }
  };

  const signUp = async (username: string, password: string, fullName: string) => {
    try {
      const { data } = await api.post("/auth/signup", { username, password, fullName });
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
      }
      await refreshUser();
      return { error: null };
    } catch (e: any) {
      return { error: e.response?.data?.error || "Signup failed" };
    }
  };

  const signOut = async () => {
    try {
      await api.post("/auth/logout");
      setUser(null);
      setRoles([]);
      localStorage.removeItem('auth_token');
    } catch (e) {
      console.error("Logout error", e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, roles, loading, signIn, signUp, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};