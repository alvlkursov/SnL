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
  isXiaomi: boolean;
}

export type AlarmClockSettings =
  | "app" | "notifications" | "exactAlarms" | "fullScreen" | "battery" | "xiaomiAutostart" | "xiaomiPermissions";

interface AlarmClockNativeModule {
  setSchedule(entriesJson: string): void;
  stopRinging(alarmId: number): void;
  cancelRing(alarmId: number): void;
  getStatus(): AlarmClockStatus;
  openSettings(target: AlarmClockSettings): boolean;
}

/** Native Android alarm clock (AlarmManager + full-screen ring). Null on iOS/web and in Expo Go. */
export const AlarmClock = requireOptionalNativeModule<AlarmClockNativeModule>("AlarmClock");
