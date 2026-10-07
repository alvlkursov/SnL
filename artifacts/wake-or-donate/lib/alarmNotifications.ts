import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import type { Alarm } from "@/context/AlarmContext";

// Android locks a channel's sound once created; bump the id to change it.
export const ALARM_CHANNEL_ID = "alarm-v1";
const ALARM_SOUND = "alarm.wav";

// Each ring is a burst of notifications so the phone keeps sounding for the
// whole 10-minute window even when the app is closed.
const BURST_OFFSETS_MIN = [0, 1, 2, 3, 4, 5, 7, 9];
const RING_WINDOW_MS = 10 * 60_000;
// How far ahead to schedule. Android allows ~500 pending alarms per app; the
// schedule is refreshed every time the app opens (which every ring causes).
const HORIZON_DAYS = 7;
// After the user dismisses/snoozes, the rest of that ring must not come back on the next sync
const SUPPRESS_KEY = "alarm_suppressed_until";

type AlarmInfo = Pick<Alarm, "id" | "label" | "donationAmount">;

export interface AlarmNotificationData {
  kind: "alarm";
  alarmId: number;
  at: number; // epoch ms this notification fires
  snooze?: boolean;
  [key: string]: unknown;
}

export function isAlarmData(data: unknown): data is AlarmNotificationData {
  return !!data && (data as AlarmNotificationData).kind === "alarm";
}

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function setupAlarmNotifications(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
      name: "Alarms",
      description: "Wake-up alarms",
      importance: Notifications.AndroidImportance.MAX,
      sound: ALARM_SOUND,
      vibrationPattern: [0, 800, 400, 800, 400, 800],
      enableVibrate: true,
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function readSuppressed(): Promise<Record<string, number>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(SUPPRESS_KEY)) ?? "{}");
  } catch {
    return {};
  }
}

async function suppress(alarmId: number, until: number) {
  const now = Date.now();
  const current = await readSuppressed();
  const pruned = Object.fromEntries(Object.entries(current).filter(([, t]) => t > now));
  await AsyncStorage.setItem(SUPPRESS_KEY, JSON.stringify({ ...pruned, [alarmId]: until }));
}

/** Ring start times for an alarm, including one still within its ring window. */
function ringStarts(alarm: Alarm, now: Date): Date[] {
  const [hh, mm] = alarm.time.split(":").map(Number);
  const result: Date[] = [];
  for (let d = -1; d <= HORIZON_DAYS; d++) {
    const at = new Date(now);
    at.setDate(now.getDate() + d);
    at.setHours(hh, mm, 0, 0);
    if (at.getTime() + RING_WINDOW_MS > now.getTime() && alarm.days.includes(at.getDay())) result.push(at);
  }
  return result;
}

function schedule(alarm: AlarmInfo, at: number, snooze: boolean) {
  const data: AlarmNotificationData = { kind: "alarm", alarmId: alarm.id, at, ...(snooze ? { snooze } : {}) };
  return Notifications.scheduleNotificationAsync({
    content: {
      title: snooze ? `⏰ ${alarm.label} (snoozed)` : `⏰ ${alarm.label}`,
      body: `Get up or donate $${alarm.donationAmount}. Tap to dismiss.`,
      sound: ALARM_SOUND,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true,
      autoDismiss: false,
      interruptionLevel: "timeSensitive",
      data,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: ALARM_CHANNEL_ID },
  });
}

async function scheduledAlarmNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.flatMap(n => isAlarmData(n.content.data) ? [{ id: n.identifier, data: n.content.data }] : []);
}

let queue: Promise<void> = Promise.resolve();
// Serialize all schedule changes: overlapping syncs would double-schedule
function enqueue(task: () => Promise<void>): Promise<void> {
  if (Platform.OS === "web") return Promise.resolve();
  queue = queue.then(task).catch(e => console.warn("Alarm notification update failed", e));
  return queue;
}

/** Brings scheduled notifications in line with the alarm list (adds missing, removes stale). */
export function syncAlarmNotifications(alarms: Alarm[]): Promise<void> {
  return enqueue(async () => {
    const now = new Date();
    const suppressed = await readSuppressed();
    const wanted = new Map<string, { alarm: Alarm; at: number }>();
    for (const alarm of alarms) {
      if (!alarm.isEnabled) continue;
      for (const start of ringStarts(alarm, now)) {
        for (const offset of BURST_OFFSETS_MIN) {
          const at = start.getTime() + offset * 60_000;
          if (at <= now.getTime() || at <= (suppressed[alarm.id] ?? 0)) continue;
          wanted.set(`${alarm.id}:${at}`, { alarm, at });
        }
      }
    }
    const existing = await scheduledAlarmNotifications();
    const existingKeys = new Set<string>();
    for (const { id, data } of existing) {
      const key = `${data.alarmId}:${data.at}`;
      const alarmStillEnabled = alarms.some(a => a.id === data.alarmId && a.isEnabled);
      // Snooze rings are kept while their alarm exists; regular rings must still be wanted
      if ((data.snooze && alarmStillEnabled) || (!data.snooze && wanted.has(key))) {
        existingKeys.add(key);
      } else {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
    }
    for (const [key, { alarm, at }] of wanted) {
      if (!existingKeys.has(key)) await schedule(alarm, at, false);
    }
  });
}

/** Stops the ring in progress (rest of the burst, pending snooze rings, notifications on screen). */
export function stopRinging(alarmId: number): Promise<void> {
  return enqueue(async () => {
    const until = Date.now() + RING_WINDOW_MS + 5 * 60_000;
    await suppress(alarmId, until);
    for (const { id, data } of await scheduledAlarmNotifications()) {
      if (data.alarmId === alarmId && (data.snooze || data.at <= until)) {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
    }
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const n of presented) {
      const data = n.request.content.data;
      if (isAlarmData(data) && data.alarmId === alarmId) await Notifications.dismissNotificationAsync(n.request.identifier);
    }
  });
}

export function scheduleSnooze(alarm: AlarmInfo, ringAt: Date): Promise<void> {
  return enqueue(async () => {
    for (const offset of BURST_OFFSETS_MIN) {
      const at = ringAt.getTime() + offset * 60_000;
      if (at > Date.now()) await schedule(alarm, at, true);
    }
  });
}

export function cancelAllAlarmNotifications(): Promise<void> {
  return enqueue(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
    await AsyncStorage.removeItem(SUPPRESS_KEY);
  });
}
