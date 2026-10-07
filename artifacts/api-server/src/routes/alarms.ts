import { Router } from "express";
import { db } from "@workspace/db";
import { alarmsTable, alarmEventsTable, donationsTable, usersTable, type Alarm } from "@workspace/db/schema";
import { eq, and, desc, lt, sql } from "drizzle-orm";
import { authMiddleware, getUserId } from "../lib/auth.js";
import { parseBody, parseId, createAlarmSchema, updateAlarmSchema } from "../lib/validation.js";
import { findCurrentEvent, currentStreak } from "../lib/events.js";
import { resolveCharity, recordDonation } from "../lib/donations.js";
import { MAX_SNOOZES, RING_WINDOW_MINUTES, minutes } from "../lib/rules.js";

const router = Router();
router.use(authMiddleware);

function toApi(alarm: Alarm) {
  return { ...alarm, days: JSON.parse(alarm.days) as number[] };
}

async function findOwnAlarm(id: number, userId: number) {
  const [alarm] = await db.select().from(alarmsTable)
    .where(and(eq(alarmsTable.id, id), eq(alarmsTable.userId, userId))).limit(1);
  return alarm;
}

router.get("/", async (req, res) => {
  const alarms = await db.select().from(alarmsTable).where(eq(alarmsTable.userId, getUserId(req)));
  res.json(alarms.map(toApi));
});

router.post("/", async (req, res) => {
  const body = parseBody(createAlarmSchema, req, res);
  if (!body) return;
  const [alarm] = await db.insert(alarmsTable).values({
    ...body,
    userId: getUserId(req),
    days: JSON.stringify(body.days),
  }).returning();
  res.status(201).json(toApi(alarm));
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  const body = parseBody(updateAlarmSchema, req, res);
  if (!body) return;
  const { days, ...rest } = body;
  const changes = { ...rest, ...(days ? { days: JSON.stringify(days) } : {}) };
  if (Object.keys(changes).length === 0) {
    const alarm = await findOwnAlarm(id, getUserId(req));
    if (!alarm) { res.status(404).json({ error: "Not Found" }); return; }
    res.json(toApi(alarm));
    return;
  }
  const [alarm] = await db.update(alarmsTable)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(alarmsTable.id, id), eq(alarmsTable.userId, getUserId(req))))
    .returning();
  if (!alarm) { res.status(404).json({ error: "Not Found" }); return; }
  res.json(toApi(alarm));
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  await db.delete(alarmsTable).where(and(eq(alarmsTable.id, id), eq(alarmsTable.userId, getUserId(req))));
  res.json({ success: true, message: "Alarm deleted" });
});

async function userTimezone(userId: number): Promise<string> {
  const [user] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return user?.timezone ?? "UTC";
}

// Unacknowledged misses, so the app can show the "Alarm missed" screen on next open
router.get("/events/missed", async (req, res) => {
  const rows = await db.select({
    id: alarmEventsTable.id,
    alarmId: alarmEventsTable.alarmId,
    label: alarmsTable.label,
    scheduledAt: alarmEventsTable.scheduledAt,
    amount: donationsTable.amount,
    charityName: donationsTable.charityName,
    charityCategory: alarmsTable.charityCategory,
    donationId: donationsTable.id,
  })
    .from(alarmEventsTable)
    .innerJoin(alarmsTable, eq(alarmEventsTable.alarmId, alarmsTable.id))
    .leftJoin(donationsTable, eq(alarmEventsTable.missedDonationId, donationsTable.id))
    .where(and(
      eq(alarmEventsTable.userId, getUserId(req)),
      eq(alarmEventsTable.status, "missed"),
      eq(alarmEventsTable.acknowledged, false),
    ))
    .orderBy(desc(alarmEventsTable.scheduledAt));
  res.json(rows);
});

router.post("/events/:eventId/ack", async (req, res) => {
  const eventId = parseId(req.params.eventId, res);
  if (eventId === null) return;
  await db.update(alarmEventsTable).set({ acknowledged: true })
    .where(and(eq(alarmEventsTable.id, eventId), eq(alarmEventsTable.userId, getUserId(req))));
  res.json({ success: true });
});

router.post("/:id/dismiss", async (req, res) => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  const userId = getUserId(req);
  const alarm = await findOwnAlarm(id, userId);
  if (!alarm) { res.status(404).json({ error: "Not Found" }); return; }

  const event = await findCurrentEvent(alarm, await userTimezone(userId));
  if (!event) {
    res.json({ success: true, donated: false, test: true, streak: await currentStreak(userId), message: "Test alarm dismissed" });
    return;
  }
  await db.transaction(async (tx) => {
    const [claimed] = await tx.update(alarmEventsTable)
      .set({ status: "dismissed", resolvedAt: new Date() })
      .where(and(eq(alarmEventsTable.id, event.id), eq(alarmEventsTable.status, "ringing")))
      .returning();
    if (!claimed) return;
    await tx.update(usersTable).set({
      alarmsDismissed: sql`${usersTable.alarmsDismissed} + 1`,
      alarmsTriggered: sql`${usersTable.alarmsTriggered} + 1`,
    }).where(eq(usersTable.id, userId));
  });
  res.json({ success: true, donated: false, test: false, streak: await currentStreak(userId), message: "Alarm dismissed. Great job waking up!" });
});

router.post("/:id/snooze", async (req, res) => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  const userId = getUserId(req);
  const alarm = await findOwnAlarm(id, userId);
  if (!alarm) { res.status(404).json({ error: "Not Found" }); return; }
  if (!alarm.snoozeEnabled) {
    res.status(400).json({ error: "Bad Request", message: "Snooze is disabled for this alarm" });
    return;
  }
  const charity = await resolveCharity(alarm);
  if (!charity) {
    res.status(503).json({ error: "Service Unavailable", message: "No charities available" });
    return;
  }
  const now = new Date();
  const ringAt = new Date(now.getTime() + minutes(alarm.snoozeDurationMinutes));

  const event = await findCurrentEvent(alarm, await userTimezone(userId), now);
  if (!event) {
    // Test alarm: show the flow without charging
    res.json({
      success: true, donated: false, test: true,
      donationAmount: alarm.donationAmount, charityName: charity.name,
      snoozeIndex: 1, snoozeLimit: MAX_SNOOZES, ringAt,
      message: `Test snooze — a real one would donate $${alarm.donationAmount} to ${charity.name}`,
    });
    return;
  }
  if (event.snoozesUsed >= MAX_SNOOZES) {
    res.status(409).json({ error: "Conflict", message: "No snoozes left — get up!" });
    return;
  }

  const donation = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(alarmEventsTable).set({
      snoozesUsed: sql`${alarmEventsTable.snoozesUsed} + 1`,
      deadline: new Date(ringAt.getTime() + minutes(RING_WINDOW_MINUTES)),
    }).where(and(
      eq(alarmEventsTable.id, event.id),
      eq(alarmEventsTable.status, "ringing"),
      lt(alarmEventsTable.snoozesUsed, MAX_SNOOZES),
    )).returning();
    if (!claimed) return null;
    await tx.update(alarmsTable).set({ snoozeCount: sql`${alarmsTable.snoozeCount} + 1` }).where(eq(alarmsTable.id, id));
    return recordDonation(tx, { userId, alarmId: id, charity, amount: alarm.donationAmount, reason: "snooze" });
  });
  if (!donation) {
    res.status(409).json({ error: "Conflict", message: "This alarm can no longer be snoozed" });
    return;
  }

  res.json({
    success: true,
    donated: true,
    test: false,
    donationId: donation.id,
    donationAmount: alarm.donationAmount,
    charityName: charity.name,
    snoozeIndex: event.snoozesUsed + 1,
    snoozeLimit: MAX_SNOOZES,
    ringAt,
    message: `$${alarm.donationAmount} donated to ${charity.name}`,
  });
});

export default router;
