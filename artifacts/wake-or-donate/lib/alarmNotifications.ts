import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import type { Alarm } from "@/context/AlarmContext";
import { AlarmClock, type AlarmClockEntry } from "@/modules/alarm-clock";

// Two delivery paths:
// - Android: the native AlarmClock module (system alarm-clock alarms with a full-screen,
//   looping ring that opens the ring screen over the lock screen).
// - Elsewhere (iOS): local notifications, sent as a burst so the phone keeps ringing.

// Android locks a channel's sound once created; bump the id to change it.
export const ALARM_CHANNEL_ID = "alarm-v1";
const ALARM_SOUND = "alarm.wav";
const BURST_OFFSETS_MIN = [0, 1, 2, 3, 4, 5, 7, 9];
// How far ahead to schedule; the schedule is refreshed on every app open (which every ring causes)
const HORIZON_DAYS = 7;
const SNOOZE_KEY = "alarm_snoozes"; // { [alarmId]: ringAt epoch ms }
export const ALARM_SETUP_SEEN_KEY = "alarm_setup_seen_v1";

type AlarmInfo = Pick<Alarm, "id" | "label" | "donationAmount">;

export interface AlarmNotificationData {
  kind: "alarm";
  alarmId: number;
  at: number; // epoch ms this notification fires
  [key: string]: unknown;
}

export function isAlarmData(data: unknown): data is AlarmNotificationData {
  return !!data && (data as AlarmNotificationData).kind === "alarm";
}

const useNativeAlarms = Platform.OS === "android" && AlarmClock !== null;

/** True when rings come from the native alarm clock, which plays the ring sound itself. */
export const nativeAlarmsAvailable = useNativeAlarms;

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
  if (Platform.OS === "android" && !useNativeAlarms) {
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

async function readSnoozes(): Promise<Record<string, number>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(SNOOZE_KEY)) ?? "{}");
  } catch {
    return {};
  }
}

async function writeSnoozes(snoozes: Record<string, number>) {
  const now = Date.now();
  const pruned = Object.fromEntries(Object.entries(snoozes).filter(([, at]) => at > now));
  await AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify(pruned));
}

/** Upcoming ring starts of an alarm (future only, so a ring already in progress is never re-added). */
function ringStarts(alarm: Alarm, now: Date): number[] {
  const [hh, mm] = alarm.time.split(":").map(Number);
  const result: number[] = [];
  for (let d = 0; d <= HORIZON_DAYS; d++) {
    const at = new Date(now);
    at.setDate(now.getDate() + d);
    at.setHours(hh, mm, 0, 0);
    if (at > now && alarm.days.includes(at.getDay())) result.push(at.getTime());
  }
  return result;
}

function entryFor(alarm: AlarmInfo, at: number, snooze: boolean): AlarmClockEntry {
  return {
    key: `${alarm.id}:${snooze ? "snooze" : "ring"}:${at}`,
    alarmId: alarm.id,
    at,
    title: snooze ? `⏰ ${alarm.label} (snoozed)` : `⏰ ${alarm.label}`,
    body: `Get up or donate $${alarm.donationAmount}`,
  };
}

/** Everything that should be scheduled right now. */
async function wantedEntries(alarms: Alarm[]): Promise<AlarmClockEntry[]> {
  const now = new Date();
  const snoozes = await readSnoozes();
  const entries: AlarmClockEntry[] = [];
  for (const alarm of alarms) {
    if (!alarm.isEnabled) continue;
    for (const at of ringStarts(alarm, now)) entries.push(entryFor(alarm, at, false));
    const snoozeAt = snoozes[alarm.id];
    if (snoozeAt && snoozeAt > now.getTime()) entries.push(entryFor(alarm, snoozeAt, true));
  }
  return entries;
}

// --- iOS / fallback: local notification bursts ---

function scheduleNotification(entry: AlarmClockEntry, at: number) {
  const data: AlarmNotificationData = { kind: "alarm", alarmId: entry.alarmId, at, entryKey: entry.key };
  return Notifications.scheduleNotificationAsync({
    content: {
      title: entry.title,
      body: `${entry.body}. Tap to dismiss.`,
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

async function syncNotificationBursts(entries: AlarmClockEntry[]) {
  const now = Date.now();
  const wanted = new Map<string, { entry: AlarmClockEntry; at: number }>();
  for (const entry of entries) {
    for (const offset of BURST_OFFSETS_MIN) {
      const at = entry.at + offset * 60_000;
      if (at > now) wanted.set(`${entry.key}@${at}`, { entry, at });
    }
  }
  const existing = new Set<string>();
  for (const { id, data } of await scheduledAlarmNotifications()) {
    const key = `${data.entryKey}@${data.at}`;
    // Keep the rest of a ring that already started (stopRinging cancels it explicitly)
    const ringStart = Number(String(data.entryKey).split(":")[2]);
    const inProgress = ringStart <= now && data.at > now;
    if (wanted.has(key) || inProgress) existing.add(key);
    else await Notifications.cancelScheduledNotificationAsync(id);
  }
  for (const [key, { entry, at }] of wanted) {
    if (!existing.has(key)) await scheduleNotification(entry, at);
  }
}

// --- shared API ---

// The last alarm list from the server, cached so a cold start from the lock screen
// (before the list loads) doesn't rebuild the schedule from an empty list
const ALARMS_CACHE_KEY = "alarm_list_cache";
let lastAlarms: Alarm[] = [];
let alarmsKnown = false;

async function ensureAlarmsKnown(): Promise<boolean> {
  if (alarmsKnown) return true;
  try {
    const raw = await AsyncStorage.getItem(ALARMS_CACHE_KEY);
    if (raw) {
      lastAlarms = JSON.parse(raw);
      alarmsKnown = true;
    }
  } catch {}
  return alarmsKnown;
}

let queue: Promise<void> = Promise.resolve();
// Serialize all schedule changes so overlapping syncs can't interleave
function enqueue(task: () => Promise<void>): Promise<void> {
  if (Platform.OS === "web") return Promise.resolve();
  queue = queue.then(task).catch(e => console.warn("Alarm schedule update failed", e));
  return queue;
}

/**
 * Builds before the native alarm clock scheduled notification bursts a week ahead.
 * Those keep firing after an update unless removed, so the native path clears them.
 */
async function clearNotificationAlarms() {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const n of await Notifications.getPresentedNotificationsAsync()) {
    if (isAlarmData(n.request.content.data)) await Notifications.dismissNotificationAsync(n.request.identifier);
  }
}

async function applySchedule() {
  // Never rebuild the schedule from a list we don't actually have
  if (!(await ensureAlarmsKnown())) return;
  const entries = await wantedEntries(lastAlarms);
  if (!useNativeAlarms) {
    await syncNotificationBursts(entries);
    return;
  }
  AlarmClock!.setSchedule(JSON.stringify(entries));
  // An alarm switched off or deleted while ringing must go quiet right away
  for (const alarm of lastAlarms) {
    if (!alarm.isEnabled) AlarmClock!.cancelRing(alarm.id);
  }
  await clearNotificationAlarms();
}

/** Makes the phone's alarm schedule match the alarm list. */
export function syncAlarmNotifications(alarms: Alarm[]): Promise<void> {
  // Deleted alarms may still be ringing: silence them too
  if (useNativeAlarms) {
    for (const old of lastAlarms) {
      if (!alarms.some(a => a.id === old.id)) AlarmClock!.cancelRing(old.id);
    }
  }
  lastAlarms = alarms;
  alarmsKnown = true;
  AsyncStorage.setItem(ALARMS_CACHE_KEY, JSON.stringify(alarms)).catch(() => {});
  return enqueue(applySchedule);
}

/** Stops the ring in progress for an alarm (after dismiss or snooze). */
export function stopRinging(alarmId: number, opts: { clearSnooze?: boolean } = {}): Promise<void> {
  return enqueue(async () => {
    if (opts.clearSnooze) {
      const snoozes = await readSnoozes();
      delete snoozes[alarmId];
      await writeSnoozes(snoozes);
    }
    if (useNativeAlarms) {
      AlarmClock!.stopRinging(alarmId);
      await applySchedule();
      return;
    }
    const soon = Date.now() + 15 * 60_000;
    for (const { id, data } of await scheduledAlarmNotifications()) {
      if (data.alarmId === alarmId && data.at <= soon) await Notifications.cancelScheduledNotificationAsync(id);
    }
    for (const n of await Notifications.getPresentedNotificationsAsync()) {
      const data = n.request.content.data;
      if (isAlarmData(data) && data.alarmId === alarmId) await Notifications.dismissNotificationAsync(n.request.identifier);
    }
    await applySchedule();
  });
}

/** Rings the alarm again at [ringAt]. */
export function scheduleSnooze(alarm: AlarmInfo, ringAt: Date): Promise<void> {
  return enqueue(async () => {
    const snoozes = await readSnoozes();
    snoozes[alarm.id] = ringAt.getTime();
    await writeSnoozes(snoozes);
    await applySchedule();
  });
}

export function cancelAllAlarmNotifications(): Promise<void> {
  lastAlarms = [];
  alarmsKnown = false;
  return enqueue(async () => {
    await AsyncStorage.multiRemove([SNOOZE_KEY, ALARMS_CACHE_KEY]);
    if (useNativeAlarms) {
      AlarmClock!.setSchedule("[]");
      await clearNotificationAlarms();
      return;
    }
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
  });
}

export interface ScheduledRing {
  alarmId: number;
  at: number;
  title: string;
}

/** What the phone will actually ring next (diagnostics). */
export function scheduledRings(): ScheduledRing[] {
  if (!useNativeAlarms) return [];
  try {
    return JSON.parse(AlarmClock!.getSchedule());
  } catch {
    return [];
  }
}
