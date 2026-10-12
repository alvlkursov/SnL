import { requireOptionalNativeModule } from "expo";

export interface AlarmClockEntry {
  key: string; // unique per ring occurrence
  alarmId: number;
  at: number; // epoch ms
  title: string;
  body: string;
}

export interface AlarmClockStatus {
  notifications: boolean;
  exactAlarms: boolean;
  fullScreen: boolean;
  overlay?: boolean; // missing in builds before 1.0.9
  batteryUnrestricted: boolean;
  isXiaomi: boolean;
}

export type AlarmClockSettings =
  | "app" | "notifications" | "exactAlarms" | "fullScreen" | "overlay" | "battery" | "xiaomiAutostart" | "xiaomiPermissions";

export interface AlarmClockRingEvent {
  alarmId: number;
  at: number; // scheduled ring time, epoch ms
}

interface AlarmClockNativeModule {
  addListener(event: "onRing", listener: (event: AlarmClockRingEvent) => void): { remove(): void };
  setSchedule(entriesJson: string): void;
  getSchedule(): string;
  getFireLog(): string;
  stopRinging(alarmId: number): void;
  ackRing?(alarmId: number): void; // missing in builds before 1.0.12
  cancelRing(alarmId: number): void;
  getStatus(): AlarmClockStatus;
  openSettings(target: AlarmClockSettings): boolean;
}

/** Native Android alarm clock (AlarmManager + full-screen ring). Null on iOS/web and in Expo Go. */
export const AlarmClock = requireOptionalNativeModule<AlarmClockNativeModule>("AlarmClock");
