import { Router } from "express";
import { db } from "@workspace/db";
import { alarmsTable, donationsTable, usersTable, charitiesTable, type Alarm } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { authMiddleware, getUserId } from "../lib/auth.js";
import { parseBody, parseId, createAlarmSchema, updateAlarmSchema } from "../lib/validation.js";

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
    .set(changes)
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

router.post("/:id/dismiss", async (req, res) => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  const userId = getUserId(req);
  const alarm = await findOwnAlarm(id, userId);
  if (!alarm) { res.status(404).json({ error: "Not Found" }); return; }
  await db.update(usersTable).set({
    alarmsDismissed: sql`${usersTable.alarmsDismissed} + 1`,
    alarmsTriggered: sql`${usersTable.alarmsTriggered} + 1`,
  }).where(eq(usersTable.id, userId));
  res.json({ success: true, donated: false, message: "Alarm dismissed. Great job waking up!" });
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

  // Resolve the charity: the alarm's own pick, or a random one from its category (remembered for next time)
  let charity = alarm.charityId
    ? (await db.select().from(charitiesTable).where(eq(charitiesTable.id, alarm.charityId)).limit(1))[0]
    : undefined;
  if (!charity) {
    const category = alarm.charityCategory === "hated" ? "hated" : "recommended";
    const candidates = await db.select().from(charitiesTable).where(eq(charitiesTable.category, category));
    charity = candidates[Math.floor(Math.random() * candidates.length)];
  }
  if (!charity) {
    res.status(503).json({ error: "Service Unavailable", message: "No charities available" });
    return;
  }
  const picked = charity;

  await db.transaction(async (tx) => {
    await tx.update(alarmsTable).set({
      snoozeCount: sql`${alarmsTable.snoozeCount} + 1`,
      charityId: picked.id,
    }).where(eq(alarmsTable.id, id));
    await tx.insert(donationsTable).values({
      userId,
      alarmId: id,
      charityId: picked.id,
      charityName: picked.name,
      amount: alarm.donationAmount,
      reason: "snooze",
      status: "completed",
    });
    await tx.update(usersTable).set({
      totalDonated: sql`${usersTable.totalDonated} + ${alarm.donationAmount}`,
      alarmsTriggered: sql`${usersTable.alarmsTriggered} + 1`,
    }).where(eq(usersTable.id, userId));
    await tx.update(charitiesTable).set({
      totalReceived: sql`${charitiesTable.totalReceived} + ${alarm.donationAmount}`,
    }).where(eq(charitiesTable.id, picked.id));
  });

  res.json({
    success: true,
    donated: true,
    donationAmount: alarm.donationAmount,
    charityName: picked.name,
    message: `$${alarm.donationAmount} donated to ${picked.name}`,
  });
});

export default router;
