import { Router } from "express";
import { db } from "@workspace/db";
import { charitiesTable, donationsTable, usersTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
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
    : await resolveCharity({ charityId: null, charityCategory: "recommended" });
  if (!charity) { res.status(404).json({ error: "Not Found", message: "Charity not found" }); return; }
  const donation = await db.transaction(tx =>
    recordDonation(tx, { userId, alarmId: null, charity, amount: body.amount, reason: "voluntary" }));
  res.status(201).json(donation);
});

router.get("/stats", async (req, res) => {
  const userId = getUserId(req);
  const donations = await db.select().from(donationsTable).where(eq(donationsTable.userId, userId));
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  const totalDonated = donations.reduce((sum, d) => sum + d.amount, 0);
  const snoozeCount = donations.filter(d => d.reason === "snooze").length;
  const missedCount = donations.filter(d => d.reason === "missed").length;

  res.json({
    totalDonated: user?.totalDonated ?? totalDonated,
    totalDonations: donations.length,
    alarmsTriggered: user?.alarmsTriggered ?? 0,
    alarmsDismissed: user?.alarmsDismissed ?? 0,
    snoozeCount,
    missedCount,
    successRate: user?.alarmsTriggered
      ? Math.round((user.alarmsDismissed / user.alarmsTriggered) * 100)
      : 0,
  });
});

export default router;
