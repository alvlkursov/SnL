import { db } from "@workspace/db";
import {
  charitiesTable, donationsTable, usersTable, alarmsTable, userFavoriteCharitiesTable, type Alarm, type Charity,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { PIGGY_BANK_NAME } from "./charityCatalog.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The alarm's chosen charity, or a random one from its category.
 * 'favorite' picks from the user's favorites (falling back to featured partners if they have none);
 * 'piggy' parks the money in the user's piggy bank until they pick a charity.
 */
export async function resolveCharity(
  alarm: Pick<Alarm, "charityId" | "charityCategory" | "userId">,
): Promise<Charity | undefined> {
  if (alarm.charityId) {
    const [charity] = await db.select().from(charitiesTable).where(eq(charitiesTable.id, alarm.charityId)).limit(1);
    if (charity) return charity;
  }
  if (alarm.charityCategory === "piggy") return piggyBank();
  let candidates: Charity[] = [];
  if (alarm.charityCategory === "favorite") {
    candidates = (await db.select({ charity: charitiesTable })
      .from(userFavoriteCharitiesTable)
      .innerJoin(charitiesTable, eq(userFavoriteCharitiesTable.charityId, charitiesTable.id))
      .where(eq(userFavoriteCharitiesTable.userId, alarm.userId))).map(r => r.charity);
  }
  if (candidates.length === 0) {
    const category = alarm.charityCategory === "hated" ? "hated" : "recommended";
    candidates = await db.select().from(charitiesTable).where(eq(charitiesTable.category, category));
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** The system "charity" row that stands for the piggy bank. */
export async function piggyBank(): Promise<Charity | undefined> {
  const [row] = await db.select().from(charitiesTable).where(eq(charitiesTable.category, "piggy")).limit(1);
  if (row) return row;
  const [created] = await db.insert(charitiesTable).values({
    name: PIGGY_BANK_NAME, description: "Your piggy bank", category: "piggy", cause: "Piggy bank",
  }).returning();
  return created;
}

/** Records a donation owed on this month's bill and updates user/charity totals. Run inside a transaction. */
export async function recordDonation(tx: Tx, params: {
  userId: number;
  alarmId: number | null;
  charity: Charity;
  amount: number;
  reason: "snooze" | "missed" | "voluntary" | "piggy";
  rotate?: boolean;
  status?: "pending" | "billed"; // 'billed' for money that was already charged (from the piggy bank)
}) {
  const [donation] = await tx.insert(donationsTable).values({
    userId: params.userId,
    alarmId: params.alarmId,
    charityId: params.charity.id,
    charityName: params.charity.name,
    amount: params.amount,
    reason: params.reason,
    status: params.status ?? "pending",
  }).returning();
  await tx.update(usersTable).set({
    totalDonated: sql`${usersTable.totalDonated} + ${params.amount}`,
  }).where(eq(usersTable.id, params.userId));
  await tx.update(charitiesTable).set({
    totalReceived: sql`${charitiesTable.totalReceived} + ${params.amount}`,
  }).where(eq(charitiesTable.id, params.charity.id));
  // Remember an auto-picked charity so the alarm keeps donating to the same place
  // (favorites keep rotating among the user's current picks instead)
  if (params.alarmId && !params.rotate) {
    await tx.update(alarmsTable).set({ charityId: params.charity.id })
      .where(sql`${alarmsTable.id} = ${params.alarmId} and ${alarmsTable.charityId} is null`);
  }
  return donation;
}
