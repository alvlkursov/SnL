import { db } from "@workspace/db";
import { alarmEventsTable, alarmsTable, usersTable, type Alarm, type AlarmEvent } from "@workspace/db/schema";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { localParts, zonedTimeToUtc } from "./time.js";
import { GRACE_MINUTES, MISSED_MULTIPLIER, RING_WINDOW_MINUTES, minutes } from "./rules.js";
import { recordDonation, resolveCharity } from "./donations.js";

// An occurrence may be opened from this long before its scheduled time (phone clock skew)
const EARLY_TOLERANCE_MS = minutes(2);
// The scheduler opens occurrences up to this long after they started, so a server that was
// asleep or restarting still charges a miss once it is back (same local day only)
const CATCH_UP_MS = minutes(12 * 60);

/** An alarm created or edited at/after its ring time did not actually ring on the phone. */
function editedAfterRing(alarm: Alarm, scheduledAt: Date): boolean {
  return alarm.updatedAt.getTime() > scheduledAt.getTime() - minutes(1);
}

/** Today's occurrence of `alarm` in `tz`, if the alarm is set for today's weekday. */
function todaysOccurrence(alarm: Alarm, tz: string, now: Date) {
  const { localDate, weekday } = localParts(now, tz);
  const days: number[] = JSON.parse(alarm.days);
  if (!days.includes(weekday)) return null;
  return { localDate, scheduledAt: zonedTimeToUtc(localDate, alarm.time, tz) };
}

async function openEvent(alarm: Alarm, occurrence: { localDate: string; scheduledAt: Date }) {
  await db.insert(alarmEventsTable).values({
    alarmId: alarm.id,
    userId: alarm.userId,
    localDate: occurrence.localDate,
    scheduledAt: occurrence.scheduledAt,
    deadline: new Date(occurrence.scheduledAt.getTime() + minutes(RING_WINDOW_MINUTES)),
  }).onConflictDoNothing();
  const [event] = await db.select().from(alarmEventsTable)
    .where(and(eq(alarmEventsTable.alarmId, alarm.id), eq(alarmEventsTable.localDate, occurrence.localDate)))
    .limit(1);
  return event;
}

/**
 * The occurrence the user is reacting to right now (dismiss/snooze), or null for a test alarm.
 * Opens the occurrence if the phone rang slightly before the scheduler got to it.
 */
export async function findCurrentEvent(alarm: Alarm, tz: string, now = new Date()): Promise<AlarmEvent | null> {
  const [ringing] = await db.select().from(alarmEventsTable)
    .where(and(eq(alarmEventsTable.alarmId, alarm.id), eq(alarmEventsTable.status, "ringing")))
    .orderBy(desc(alarmEventsTable.scheduledAt)).limit(1);
  if (ringing) return ringing;

  if (!alarm.isEnabled) return null;
  const occurrence = todaysOccurrence(alarm, tz, now);
  if (!occurrence || editedAfterRing(alarm, occurrence.scheduledAt)) return null;
  const start = occurrence.scheduledAt.getTime() - EARLY_TOLERANCE_MS;
  const end = occurrence.scheduledAt.getTime() + minutes(RING_WINDOW_MINUTES + GRACE_MINUTES);
  if (now.getTime() < start || now.getTime() > end) return null;
  const event = await openEvent(alarm, occurrence);
  return event?.status === "ringing" ? event : null;
}

/** Opens occurrences for alarms whose time has just come. */
export async function openDueEvents(now = new Date()) {
  const rows = await db.select({ alarm: alarmsTable, tz: usersTable.timezone })
    .from(alarmsTable)
    .innerJoin(usersTable, eq(alarmsTable.userId, usersTable.id))
    .where(eq(alarmsTable.isEnabled, true));
  for (const { alarm, tz } of rows) {
    const occurrence = todaysOccurrence(alarm, tz, now);
    if (!occurrence) continue;
    const sinceStart = now.getTime() - occurrence.scheduledAt.getTime();
    if (sinceStart < 0 || sinceStart > CATCH_UP_MS) continue;
    if (editedAfterRing(alarm, occurrence.scheduledAt)) continue;
    await openEvent(alarm, occurrence);
  }
}

/** Marks overdue occurrences as missed and charges the miss penalty. */
export async function chargeMissedEvents(now = new Date()) {
  const cutoff = new Date(now.getTime() - minutes(GRACE_MINUTES));
  const overdue = await db.select().from(alarmEventsTable)
    .where(and(eq(alarmEventsTable.status, "ringing"), lt(alarmEventsTable.deadline, cutoff)));
  for (const event of overdue) {
    const [alarm] = await db.select().from(alarmsTable).where(eq(alarmsTable.id, event.alarmId)).limit(1);
    if (!alarm) continue;
    const charity = await resolveCharity(alarm);
    await db.transaction(async (tx) => {
      // Guard against a dismiss that landed concurrently
      const [claimed] = await tx.update(alarmEventsTable)
        .set({ status: "missed", resolvedAt: now })
        .where(and(eq(alarmEventsTable.id, event.id), eq(alarmEventsTable.status, "ringing")))
        .returning();
      if (!claimed) return;
      await tx.update(usersTable).set({ alarmsTriggered: sql`${usersTable.alarmsTriggered} + 1` })
        .where(eq(usersTable.id, event.userId));
      if (!charity) return;
      const donation = await recordDonation(tx, {
        userId: event.userId,
        alarmId: alarm.id,
        charity,
        amount: alarm.donationAmount * MISSED_MULTIPLIER,
        reason: "missed",
      });
      await tx.update(alarmEventsTable).set({ missedDonationId: donation.id }).where(eq(alarmEventsTable.id, event.id));
    });
  }
}

/** Consecutive occurrences the user woke up for (snoozes allowed), most recent first. */
export async function currentStreak(userId: number): Promise<number> {
  const recent = await db.select({ status: alarmEventsTable.status }).from(alarmEventsTable)
    .where(and(eq(alarmEventsTable.userId, userId), sql`${alarmEventsTable.status} <> 'ringing'`))
    .orderBy(desc(alarmEventsTable.scheduledAt)).limit(365);
  const firstMiss = recent.findIndex(e => e.status === "missed");
  return firstMiss === -1 ? recent.length : firstMiss;
}

const TICK_MS = 30 * 1000;

export function startScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await openDueEvents();
      await chargeMissedEvents();
    } catch (e) {
      console.error("scheduler tick failed", e);
    } finally {
      running = false;
    }
  };
  setInterval(tick, TICK_MS);
  void tick();
}
