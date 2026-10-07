// Product rules for how alarms escalate into donations.
export const RING_WINDOW_MINUTES = 10;   // alarm rings this long before it counts as missed
export const GRACE_MINUTES = 5;          // extra slack for slow networks before charging a miss
export const MAX_SNOOZES = 3;            // per alarm occurrence
export const MISSED_MULTIPLIER = 2;      // a miss costs this many times the alarm's amount

export const minutes = (n: number) => n * 60 * 1000;
