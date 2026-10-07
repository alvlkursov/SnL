import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useAuth, BASE_URL } from "./AuthContext";
import { syncAlarmNotifications } from "@/lib/alarmNotifications";

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

export interface DismissResult {
  donated: false;
  test: boolean;
  streak: number;
  message: string;
}

export interface SnoozeResult {
  donated: boolean;
  test: boolean;
  donationId?: number;
  donationAmount: number;
  charityName: string;
  snoozeIndex: number;
  snoozeLimit: number;
  ringAt: string;
  message: string;
}

export interface MissedEvent {
  id: number;
  alarmId: number;
  label: string;
  scheduledAt: string;
  amount: number | null;
  charityName: string | null;
  charityCategory: Alarm["charityCategory"];
  donationId: number | null;
}

export interface Donation {
  id: number;
  amount: number;
  charityName: string;
  reason: "snooze" | "missed" | "voluntary";
  createdAt: string;
}

interface AlarmContextType {
  alarms: Alarm[];
  isLoading: boolean;
  fetchAlarms: () => Promise<void>;
  createAlarm: (data: CreateAlarmData) => Promise<void>;
  updateAlarm: (id: number, data: Partial<CreateAlarmData>) => Promise<void>;
  deleteAlarm: (id: number) => Promise<void>;
  dismissAlarm: (id: number) => Promise<DismissResult>;
  snoozeAlarm: (id: number) => Promise<SnoozeResult>;
  fetchMissedEvents: () => Promise<MissedEvent[]>;
  acknowledgeMissed: (eventId: number) => Promise<void>;
  donateVoluntarily: (amount: number) => Promise<Donation>;
}

const AlarmContext = createContext<AlarmContextType | null>(null);

export function AlarmProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // True once the list came from the server; never sync notifications from a stale/empty list
  const [hasLoaded, setHasLoaded] = useState(false);

  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  });

  const fetchAlarms = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/alarms`, { headers: authHeaders() });
      if (res.ok) {
        setAlarms(await res.json());
        setHasLoaded(true);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchAlarms();
    else {
      setAlarms([]);
      setHasLoaded(false);
    }
  }, [fetchAlarms, token]);

  // Keep the phone's scheduled alarm notifications in sync with the server's alarm list
  useEffect(() => {
    if (token && hasLoaded) syncAlarmNotifications(alarms);
  }, [alarms, token, hasLoaded]);

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

  const postJson = async <T,>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message ?? "Request failed");
    return json as T;
  };

  const dismissAlarm = (id: number) => postJson<DismissResult>(`/alarms/${id}/dismiss`);

  const snoozeAlarm = (id: number) => postJson<SnoozeResult>(`/alarms/${id}/snooze`);

  const fetchMissedEvents = useCallback(async (): Promise<MissedEvent[]> => {
    if (!token) return [];
    const res = await fetch(`${BASE_URL}/alarms/events/missed`, { headers: authHeaders() });
    return res.ok ? await res.json() : [];
  }, [token]);

  const acknowledgeMissed = async (eventId: number) => {
    await postJson(`/alarms/events/${eventId}/ack`);
  };

  const donateVoluntarily = (amount: number) => postJson<Donation>("/donations", { amount });

  return (
    <AlarmContext.Provider value={{
      alarms, isLoading, fetchAlarms, createAlarm, updateAlarm, deleteAlarm, dismissAlarm, snoozeAlarm,
      fetchMissedEvents, acknowledgeMissed, donateVoluntarily,
    }}>
      {children}
    </AlarmContext.Provider>
  );
}

export function useAlarms() {
  const ctx = useContext(AlarmContext);
  if (!ctx) throw new Error("useAlarms must be used within AlarmProvider");
  return ctx;
}
