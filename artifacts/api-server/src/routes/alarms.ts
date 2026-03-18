import { Router } from "express";
import { db } from "@workspace/db";
import { alarmsTable, donationsTable, usersTable, charitiesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../lib/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const userId = (req as any).userId;
    const alarms = await db.select().from(alarmsTable).where(eq(alarmsTable.userId, userId));
    res.json(alarms.map(a => ({ ...a, days: JSON.parse(a.days) })));
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error", message: String(e) });
  }
});

router.post("/", async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { label, time, days, donationAmount, charityId, charityCategory, confirmationMethod, snoozeEnabled, snoozeDurationMinutes } = req.body;
    const [alarm] = await db.insert(alarmsTable).values({
      userId,
      label,
      time,
      days: JSON.stringify(days),
      donationAmount,
      charityId: charityId ?? null,
      charityCategory: charityCategory ?? null,
      confirmationMethod,
      snoozeEnabled,
      snoozeDurationMinutes,
    }).returning();
    res.status(201).json({ ...alarm, days: JSON.parse(alarm.days) });
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error", message: String(e) });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const userId = (req as any).userId;
    const id = parseInt(req.params.id);
    const body = { ...req.body };
    if (body.days) body.days = JSON.stringify(body.days);
    const [alarm] = await db.update(alarmsTable)
      .set(body)
      .where(and(eq(alarmsTable.id, id), eq(alarmsTable.userId, userId)))
      .returning();
    if (!alarm) { res.status(404).json({ error: "Not Found" }); return; }
    res.json({ ...alarm, days: JSON.parse(alarm.days) });
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error", message: String(e) });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const userId = (req as any).userId;
    const id = parseInt(req.params.id);
    await db.delete(alarmsTable).where(and(eq(alarmsTable.id, id), eq(alarmsTable.userId, userId)));
    res.json({ success: true, message: "Alarm deleted" });
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error", message: String(e) });
  }
});

router.post("/:id/dismiss", async (req, res) => {
  try {
    const userId = (req as any).userId;
    const id = parseInt(req.params.id);
    const [alarm] = await db.select().from(alarmsTable).where(and(eq(alarmsTable.id, id), eq(alarmsTable.userId, userId))).limit(1);
    if (!alarm) { res.status(404).json({ error: "Not Found" }); return; }
    await db.update(usersTable).set({
      alarmsDismissed: (await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1))[0].alarmsDismissed + 1,
      alarmsTriggered: (await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1))[0].alarmsTriggered + 1,
    }).where(eq(usersTable.id, userId));
    res.json({ success: true, donated: false, message: "Alarm dismissed. Great job waking up!" });
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error", message: String(e) });
  }
});

router.post("/:id/snooze", async (req, res) => {
  try {
    const userId = (req as any).userId;
    const id = parseInt(req.params.id);
    const [alarm] = await db.select().from(alarmsTable).where(and(eq(alarmsTable.id, id), eq(alarmsTable.userId, userId))).limit(1);
    if (!alarm) { res.status(404).json({ error: "Not Found" }); return; }

    // Increment snooze count
    await db.update(alarmsTable).set({ snoozeCount: alarm.snoozeCount + 1 }).where(eq(alarmsTable.id, id));

    let charityName = "Unknown";
    if (alarm.charityId) {
      const [charity] = await db.select().from(charitiesTable).where(eq(charitiesTable.id, alarm.charityId)).limit(1);
      if (charity) charityName = charity.name;
    } else {
      // Pick random charity based on category
      const cat = alarm.charityCategory === "hated" ? "hated" : "recommended";
      const charities = await db.select().from(charitiesTable).where(eq(charitiesTable.category, cat));
      if (charities.length > 0) {
        const picked = charities[Math.floor(Math.random() * charities.length)];
        charityName = picked.name;
        await db.update(alarmsTable).set({ charityId: picked.id }).where(eq(alarmsTable.id, id));
      }
    }

    const [charity] = alarm.charityId ? await db.select().from(charitiesTable).where(eq(charitiesTable.id, alarm.charityId!)).limit(1) : [{ id: 0, name: charityName }];

    // Record donation
    if (charity && charity.id) {
      await db.insert(donationsTable).values({
        userId,
        alarmId: id,
        charityId: charity.id,
        charityName,
        amount: alarm.donationAmount,
        reason: "snooze",
        status: "completed",
      });

      // Update user stats
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      await db.update(usersTable).set({
        totalDonated: user.totalDonated + alarm.donationAmount,
        alarmsTriggered: user.alarmsTriggered + 1,
      }).where(eq(usersTable.id, userId));

      // Update charity total
      await db.update(charitiesTable).set({ totalReceived: charity.totalReceived + alarm.donationAmount }).where(eq(charitiesTable.id, charity.id));
    }

    res.json({
      success: true,
      donated: true,
      donationAmount: alarm.donationAmount,
      charityName,
      message: `$${alarm.donationAmount} donated to ${charityName}`,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error", message: String(e) });
  }
});

export default router;
