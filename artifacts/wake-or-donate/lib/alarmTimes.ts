import type { Alarm } from "@/context/AlarmContext";

/** The next regular ring of an alarm within a week, or null if it is off / has no days. */
export function nextRingTime(alarm: Alarm, now: Date): Date | null {
  if (!alarm.isEnabled) return null;
  const [hh, mm] = alarm.time.split(":").map(Number);
  for (let d = 0; d <= 7; d++) {
    const at = new Date(now);
    at.setDate(now.getDate() + d);
    at.setHours(hh, mm, 0, 0);
    if (at > now && alarm.days.includes(at.getDay())) return at;
  }
  return null;
}

/** "4:32" for short waits, "3h 12m" / "2d 4h" for longer ones. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (days > 0) return `${days}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatRingDay(at: Date, now: Date): string {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (at.toDateString() === now.toDateString()) return `Today ${time}`;
  if (at.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${at.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
}
