// Timezone helpers built on Intl (no extra dependencies).

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of `date` in `tz`. */
export function localParts(date: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", weekday: "short",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).map(p => [p.type, p.value]),
  );
  return {
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday],
    hhmm: `${parts.hour}:${parts.minute}`,
    // Wall-clock time read as if it were UTC; used to compute the zone offset
    asUtcMs: Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second),
  };
}

/** The UTC instant at which the wall clock in `tz` reads `localDate` `hhmm`. */
export function zonedTimeToUtc(localDate: string, hhmm: string, tz: string): Date {
  const [y, m, d] = localDate.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  const wallMs = Date.UTC(y, m - 1, d, h, min);
  let guess = wallMs;
  // Two passes settle DST transitions
  for (let i = 0; i < 2; i++) {
    const offset = localParts(new Date(guess), tz).asUtcMs - guess;
    guess = wallMs - offset;
  }
  return new Date(guess);
}
