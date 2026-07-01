import React, { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";
import { dispatchSuspended } from "@/components/SuspendedModal";
import { toast } from "sonner";

interface AuthContextType {
  user: any | null;
  roles: string[];
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null; user: any | null }>;
  signUp: (username: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshingRef = React.useRef(false);

  const refreshUser = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setLoading(false);
      refreshingRef.current = false;
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      if (data.user) {
        setUser(data.user);
        setRoles(data.roles || []);
      } else {
        setUser(null);
        setRoles([]);
      }
    } catch (e: any) {
      setUser(null);
      setRoles([]);
      const isAuthError = e.response && (e.response.status === 401 || e.response.status === 403);
      const errorMsg = e.response?.data?.error || '';
      if (errorMsg.includes('ระงับ')) {
        dispatchSuspended(); // removes token + shows modal (one-shot guard inside)
      } else if (isAuthError) {
        localStorage.removeItem('auth_token');
      } else {
        console.error("Network or server error fetching user:", e.message);
        toast.error(`ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: ${e.message}`);
      }
    } finally {
      setLoading(false);
      refreshingRef.current = false;
    }
  };

  useEffect(() => {
    refreshUser();

    // Poll every 30 seconds to detect real-time suspension by admin
    const intervalId = setInterval(() => {
      const token = localStorage.getItem('auth_token');
      if (token) refreshUser();
    }, 30_000);

    // Also re-check immediately when user switches back to this tab
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const token = localStorage.getItem('auth_token');
        if (token) refreshUser();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const signIn = async (username: string, password: string) => {
    try {
      const { data } = await api.post("/auth/login", { username, password });
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
      }
      await refreshUser();
      return { error: null, user: data.user };
    } catch (e: any) {
      return { error: e.response?.data?.error || "Login failed", user: null };
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