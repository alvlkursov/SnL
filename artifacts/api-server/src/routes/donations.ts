import { Router } from "express";
import { db } from "@workspace/db";
import { donationsTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware, getUserId } from "../lib/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const userId = getUserId(req);
  const donations = await db.select().from(donationsTable).where(eq(donationsTable.userId, userId));
  res.json(donations);
});

router.get("/stats", async (req, res) => {
  const userId = getUserId(req);
  const donations = await db.select().from(donationsTable).where(eq(donationsTable.userId, userId));
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  const totalDonated = donations.reduce((sum, d) => sum + d.amount, 0);
  const snoozeCount = donations.filter(d => d.reason === "snooze").length;

  res.json({
    totalDonated: user?.totalDonated ?? totalDonated,
    totalDonations: donations.length,
    alarmsTriggered: user?.alarmsTriggered ?? 0,
    alarmsDismissed: user?.alarmsDismissed ?? 0,
    snoozeCount,
    successRate: user?.alarmsTriggered
      ? Math.round((user.alarmsDismissed / user.alarmsTriggered) * 100)
      : 0,
  });
});

export default router;
