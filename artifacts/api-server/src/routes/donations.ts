import { Router } from "express";
import { db } from "@workspace/db";
import { alarmEventsTable, charitiesTable, donationsTable, usersTable } from "@workspace/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { currentStreak } from "../lib/events.js";
import { authMiddleware, getUserId } from "../lib/auth.js";
import { parseBody, voluntaryDonationSchema } from "../lib/validation.js";
import { recordDonation, resolveCharity } from "../lib/donations.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const userId = getUserId(req);
  const donations = await db.select().from(donationsTable).where(eq(donationsTable.userId, userId))
    .orderBy(desc(donationsTable.createdAt));
  res.json(donations);
});

// "Feeling generous" donation after waking up on time
router.post("/", async (req, res) => {
  const body = parseBody(voluntaryDonationSchema, req, res);
  if (!body) return;
  const userId = getUserId(req);
  const charity = body.charityId
    ? (await db.select().from(charitiesTable).where(eq(charitiesTable.id, body.charityId)).limit(1))[0]
    : await resolveCharity({ charityId: null, charityCategory: "favorite", userId });
  if (!charity) { res.status(404).json({ error: "Not Found", message: "Charity not found" }); return; }
  const donation = await db.transaction(tx =>
    recordDonation(tx, { userId, alarmId: null, charity, amount: body.amount, reason: "voluntary" }));
  res.status(201).json(donation);
});

// Computed from the ring history itself, so it can't drift from what actually happened.
// Test rings (outside a real alarm time) are not recorded and don't count.
router.get("/stats", async (req, res) => {
  const userId = getUserId(req);
  const [events] = await db.select({
    dismissed: sql<number>`count(*) filter (where ${alarmEventsTable.status} = 'dismissed')`.mapWith(Number),
    missed: sql<number>`count(*) filter (where ${alarmEventsTable.status} = 'missed')`.mapWith(Number),
    onTime: sql<number>`count(*) filter (where ${alarmEventsTable.status} = 'dismissed' and ${alarmEventsTable.snoozesUsed} = 0)`.mapWith(Number),
    snoozes: sql<number>`coalesce(sum(${alarmEventsTable.snoozesUsed}), 0)`.mapWith(Number),
  }).from(alarmEventsTable).where(eq(alarmEventsTable.userId, userId));
  const [money] = await db.select({
    total: sql<number>`coalesce(sum(${donationsTable.amount}), 0)`.mapWith(Number),
    count: sql<number>`count(*)`.mapWith(Number),
  }).from(donationsTable).where(eq(donationsTable.userId, userId));

  const resolved = events.dismissed + events.missed;
  res.json({
    totalDonated: money.total,
    totalDonations: money.count,
    alarmsTriggered: resolved,
    alarmsDismissed: events.dismissed,
    onTimeCount: events.onTime,
    missedCount: events.missed,
    snoozeCount: events.snoozes,
    successRate: resolved ? Math.round((events.dismissed / resolved) * 100) : 0,
    streak: await currentStreak(userId),
  });
});

// Wipes the user's ring history and donation records (useful after testing).
// TODO(payments): once real charges exist, keep paid donations and only hide them from stats.
router.post("/reset", async (req, res) => {
  const userId = getUserId(req);
  await db.transaction(async (tx) => {
    await tx.delete(alarmEventsTable).where(eq(alarmEventsTable.userId, userId));
    await tx.delete(donationsTable).where(eq(donationsTable.userId, userId));
    await tx.update(usersTable).set({ totalDonated: 0, alarmsTriggered: 0, alarmsDismissed: 0 })
      .where(eq(usersTable.id, userId));
  });
  res.json({ success: true });
});

export default router;
