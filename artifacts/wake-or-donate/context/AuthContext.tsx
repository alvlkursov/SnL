import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { cancelAllAlarmNotifications } from "@/lib/alarmNotifications";

// Standalone builds point at the deployed server; Replit dev uses its dev domain
const BASE_URL = process.env.EXPO_PUBLIC_API_URL
  ? process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "")
  : process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
    : "/api";

const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Alarms are evaluated server-side in the user's local time, so keep it current
async function reportTimezone(token: string) {
  try {
    await fetch(`${BASE_URL}/auth/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ timezone: deviceTimezone() }),
    });
  } catch {}
}

export interface User {
  id: number;
  email: string;
  name: string;
  paypalEmail: string | null;
  totalDonated: number;
  alarmsTriggered: number;
  alarmsDismissed: number;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  async function loadStoredAuth() {
    try {
      const storedToken = await AsyncStorage.getItem("auth_token");
      const storedUser = await AsyncStorage.getItem("auth_user");
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        // Refresh user data from server
        try {
          const res = await fetch(`${BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (res.ok) {
            const userData = await res.json();
            setUser(userData);
            await AsyncStorage.setItem("auth_user", JSON.stringify(userData));
            reportTimezone(storedToken);
          } else {
            // Token expired
            await clearAuth();
          }
        } catch {
          // Network error, use cached user
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }

  async function clearAuth() {
    setUser(null);
    setToken(null);
    await AsyncStorage.removeItem("auth_token");
    await AsyncStorage.removeItem("auth_user");
  }

  async function login(email: string, password: string) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message ?? "Login failed");
    }
    const { user: userData, token: newToken } = await res.json();
    reportTimezone(newToken);
    setUser(userData);
    setToken(newToken);
    await AsyncStorage.setItem("auth_token", newToken);
    await AsyncStorage.setItem("auth_user", JSON.stringify(userData));
  }

  async function register(email: string, password: string, name: string) {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, timezone: deviceTimezone() }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message ?? "Registration failed");
    }
    const { user: userData, token: newToken } = await res.json();
    setUser(userData);
    setToken(newToken);
    await AsyncStorage.setItem("auth_token", newToken);
    await AsyncStorage.setItem("auth_user", JSON.stringify(userData));
  }

  async function logout() {
    if (token) {
      try {
        await fetch(`${BASE_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    await cancelAllAlarmNotifications();
    await clearAuth();
  }

  async function deleteAccount(password: string) {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Could not delete account");
    }
    await cancelAllAlarmNotifications();
    await clearAuth();
  }

  async function refreshUser() {
    if (!token) return;
    try {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        await AsyncStorage.setItem("auth_user", JSON.stringify(userData));
      }
    } catch {}
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, deleteAccount, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Absolute URL of a public page served by the API server (privacy policy etc.). */
export function publicPageUrl(path: string): string {
  const base = BASE_URL.startsWith("/") && typeof window !== "undefined" && window.location
    ? `${window.location.origin}${BASE_URL}`
    : BASE_URL;
  return `${base}${path}`;
}

export { BASE_URL };
