import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useAlarms } from "@/context/AlarmContext";
import { isAlarmData, setupAlarmNotifications } from "@/lib/alarmNotifications";
import { ringingAlarm } from "@/lib/ringingState";

// Ignore taps on notifications older than this (e.g. a stale one restored after restart)
const MAX_RESPONSE_AGE_MS = 30 * 60_000;

/** Background glue: permissions, opening the ring screen from notifications, and showing missed alarms. */
export function AlarmRuntime() {
  const { token, user } = useAuth();
  const { fetchAlarms, fetchMissedEvents } = useAlarms();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledResponses = useRef(new Set<string>());

  const openRingScreen = (alarmId: number) => {
    if (ringingAlarm.id === alarmId) return;
    ringingAlarm.id = alarmId;
    router.push({ pathname: "/alarm/active", params: { id: alarmId } });
  };

  useEffect(() => {
    if (token) setupAlarmNotifications().catch(() => {});
  }, [token]);

  // User tapped an alarm notification (also fires on cold start from a notification)
  useEffect(() => {
    if (!user || !lastResponse) return;
    const { request, date } = lastResponse.notification;
    const { identifier, content } = request;
    if (handledResponses.current.has(identifier)) return;
    handledResponses.current.add(identifier);
    if (isAlarmData(content.data) && Date.now() - date < MAX_RESPONSE_AGE_MS) {
      openRingScreen(content.data.alarmId);
    }
  }, [lastResponse, user]);

  // An alarm fired while the app is open: go straight to the ring screen
  useEffect(() => {
    if (Platform.OS === "web" || !user) return;
    const sub = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      if (isAlarmData(data)) openRingScreen(data.alarmId);
    });
    return () => sub.remove();
  }, [user]);

  // On every return to the app: refresh alarms (re-syncs the schedule) and surface misses
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      fetchAlarms();
      const missed = await fetchMissedEvents();
      const first = missed[0];
      if (!first || ringingAlarm.id !== null) return;
      router.push({
        pathname: "/alarm/missed",
        params: {
          eventId: first.id,
          amount: String(first.amount ?? 0),
          fund: first.charityName ?? "",
          label: first.label,
          category: first.charityCategory ?? "",
          donationId: first.donationId ? String(first.donationId) : "",
        },
      });
    };
    check();
    const sub = AppState.addEventListener("change", state => { if (state === "active") check(); });
    return () => sub.remove();
  }, [user?.id]);

  return null;
}
