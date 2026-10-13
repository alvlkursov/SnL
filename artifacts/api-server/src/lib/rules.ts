// Product rules for how alarms escalate into donations.
export const RING_WINDOW_MINUTES = 10;   // alarm rings this long before it counts as missed
export const GRACE_MINUTES = 5;          // extra slack for slow networks before charging a miss
export const MAX_SNOOZES = 3;            // per alarm occurrence
export const MISSED_MULTIPLIER = 2;      // a miss costs this many times the alarm's amount
export const MAX_FAVORITE_CHARITIES = 3; // per user

// Billing: one charge a month for everything owed, plus our fee
export const FEE_PERCENT = 10;            // our share on top of the donations…
export const MIN_FEE_CENTS = 100;         // …but never less than $1 per bill
export const EARLY_BILL_CENTS = 5000;     // bill right away once $50 is owed, so debt can't pile up
export const RETRY_DAYS = [1, 3, 7];      // retries after a failed charge
export const PIGGY_LOCK_DAYS = 90;        // piggy bank money can be taken back only after this…
export const PIGGY_CLAIM_DAYS = 30;       // …and only for this long; then we donate it ourselves

/** Our fee for a bill of `subtotalCents` donations: 10%, at least $1. */
export function feeFor(subtotalCents: number): number {
  if (subtotalCents <= 0) return 0;
  return Math.max(Math.round((subtotalCents * FEE_PERCENT) / 100), MIN_FEE_CENTS);
}

export const days = (n: number) => n * 24 * 60 * 60 * 1000;

export const minutes = (n: number) => n * 60 * 1000;
