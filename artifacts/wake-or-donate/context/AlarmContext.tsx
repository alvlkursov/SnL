import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useAuth, BASE_URL } from "./AuthContext";

export interface Alarm {
  id: number;
  userId: number;
  label: string;
  time: string; // HH:mm
  days: number[];
  isEnabled: boolean;
  donationAmount: number;
  charityId: number | null;
  charityCategory: "favorite" | "recommended" | "hated" | null;
  confirmationMethod: "button" | "math" | "shake" | "qr";
  snoozeEnabled: boolean;
  snoozeCount: number;
  snoozeDurationMinutes: number;
  createdAt: string;
}

export type CreateAlarmData = Omit<Alarm, "id" | "userId" | "createdAt" | "snoozeCount">;

interface AlarmContextType {
  alarms: Alarm[];
  isLoading: boolean;
  fetchAlarms: () => Promise<void>;
  createAlarm: (data: CreateAlarmData) => Promise<void>;
  updateAlarm: (id: number, data: Partial<CreateAlarmData>) => Promise<void>;
  deleteAlarm: (id: number) => Promise<void>;
  dismissAlarm: (id: number) => Promise<{ donated: boolean; donationAmount?: number; charityName?: string; message: string }>;
  snoozeAlarm: (id: number) => Promise<{ donated: boolean; donationAmount?: number; charityName?: string; message: string }>;
}

const AlarmContext = createContext<AlarmContextType | null>(null);

export function AlarmProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  });

  const fetchAlarms = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/alarms`, { headers: authHeaders() });
      if (res.ok) setAlarms(await res.json());
    } catch {} finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAlarms(); }, [fetchAlarms]);

  const createAlarm = async (data: CreateAlarmData) => {
    const res = await fetch(`${BASE_URL}/alarms`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create alarm");
    const alarm = await res.json();
    setAlarms(prev => [...prev, alarm]);
  };

  const updateAlarm = async (id: number, data: Partial<CreateAlarmData>) => {
    const res = await fetch(`${BASE_URL}/alarms/${id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update alarm");
    const updated = await res.json();
    setAlarms(prev => prev.map(a => a.id === id ? updated : a));
  };

  const deleteAlarm = async (id: number) => {
    await fetch(`${BASE_URL}/alarms/${id}`, { method: "DELETE", headers: authHeaders() });
    setAlarms(prev => prev.filter(a => a.id !== id));
  };

  const dismissAlarm = async (id: number) => {
    const res = await fetch(`${BASE_URL}/alarms/${id}/dismiss`, {
      method: "POST",
      headers: authHeaders(),
    });
    return await res.json();
  };

  const snoozeAlarm = async (id: number) => {
    const res = await fetch(`${BASE_URL}/alarms/${id}/snooze`, {
      method: "POST",
      headers: authHeaders(),
    });
    return await res.json();
  };

  return (
    <AlarmContext.Provider value={{ alarms, isLoading, fetchAlarms, createAlarm, updateAlarm, deleteAlarm, dismissAlarm, snoozeAlarm }}>
      {children}
    </AlarmContext.Provider>
  );
}

export function useAlarms() {
  const ctx = useContext(AlarmContext);
  if (!ctx) throw new Error("useAlarms must be used within AlarmProvider");
  return ctx;
}
