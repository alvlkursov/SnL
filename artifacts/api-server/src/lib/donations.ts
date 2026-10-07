import { db } from "@workspace/db";
import { charitiesTable, donationsTable, usersTable, alarmsTable, type Alarm, type Charity } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The alarm's chosen charity, or a random one from its category. */
export async function resolveCharity(alarm: Pick<Alarm, "charityId" | "charityCategory">): Promise<Charity | undefined> {
  if (alarm.charityId) {
    const [charity] = await db.select().from(charitiesTable).where(eq(charitiesTable.id, alarm.charityId)).limit(1);
    if (charity) return charity;
  }
  const category = alarm.charityCategory === "hated" ? "hated" : "recommended";
  const candidates = await db.select().from(charitiesTable).where(eq(charitiesTable.category, category));
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Records a donation and updates user/charity totals. Run inside a transaction. */
export async function recordDonation(tx: Tx, params: {
  userId: number;
  alarmId: number | null;
  charity: Charity;
  amount: number;
  reason: "snooze" | "missed" | "voluntary";
}) {
  const [donation] = await tx.insert(donationsTable).values({
    userId: params.userId,
    alarmId: params.alarmId,
    charityId: params.charity.id,
    charityName: params.charity.name,
    amount: params.amount,
    reason: params.reason,
    status: "completed", // TODO(payments): 'pending' until the card charge succeeds
  }).returning();
  await tx.update(usersTable).set({
    totalDonated: sql`${usersTable.totalDonated} + ${params.amount}`,
  }).where(eq(usersTable.id, params.userId));
  await tx.update(charitiesTable).set({
    totalReceived: sql`${charitiesTable.totalReceived} + ${params.amount}`,
  }).where(eq(charitiesTable.id, params.charity.id));
  // Remember an auto-picked charity so the alarm keeps donating to the same place
  if (params.alarmId) {
    await tx.update(alarmsTable).set({ charityId: params.charity.id })
      .where(sql`${alarmsTable.id} = ${params.alarmId} and ${alarmsTable.charityId} is null`);
  }
  return donation;
}
