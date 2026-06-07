"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { authAPI } from "@/lib/api";
import { normalizeRole } from "@/lib/roleAccess";

export type UserRole = "management_admin" | "senior_manager" | "hr_recruiter" | "employee" | "candidate";

interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  department?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const withNormalizedRole = (raw: User): User => ({
    ...raw,
    role: (normalizeRole(raw.role) || raw.role) as UserRole,
  });

  const refreshUser = async () => {
    try {
      const { data } = await authAPI.me();
      const normalized = withNormalizedRole(data as User);
      setUser(normalized);
      localStorage.setItem("user", JSON.stringify(normalized));
    } catch {
      setToken(null);
      setUser(null);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
  };

  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");
    if (savedToken) {
      setToken(savedToken);
      if (savedUser) setUser(withNormalizedRole(JSON.parse(savedUser) as User));
      refreshUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await authAPI.login(email, password);
    setToken(data.access_token);
    const normalized = withNormalizedRole(data.user);
    setUser(normalized);
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(normalized));
  };

  const register = async (name: string, email: string, password: string, role: UserRole) => {
    const { data } = await authAPI.register({ name, email, password, role });
    const normalized = withNormalizedRole(data.user);
    setToken(data.access_token);
    setUser(normalized);
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(normalized));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, register, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
