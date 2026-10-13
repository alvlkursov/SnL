import { db } from "@workspace/db";
import {
  donationsTable, invoicesTable, paymentMethodsTable, payoutsTable,
  piggyActivityTable, piggyDepositsTable, usersTable, type Charity, type Invoice,
} from "@workspace/db/schema";
import { and, asc, eq, gt, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { paymentProvider } from "./payments/index.js";
import { piggyBank, recordDonation } from "./donations.js";
import { emailConfigured, sendEmail } from "./email.js";
import { EARLY_BILL_CENTS, PIGGY_CLAIM_DAYS, PIGGY_LOCK_DAYS, RETRY_DAYS, days, feeFor } from "./rules.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const toCents = (dollars: number) => Math.round(dollars * 100);
export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** 'YYYY-MM' in UTC. */
export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** First moment of next month: when this month's donations get billed. */
export function nextBillingDate(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

// --- What the user owes right now -------------------------------------------------------------

const unbilled = (userId: number) => and(
  eq(donationsTable.userId, userId), eq(donationsTable.status, "pending"), isNull(donationsTable.invoiceId),
);

/** Donations on the next bill, grouped by charity, with the fee that will be added. */
export async function openBill(userId: number) {
  const rows = await db.select({
    charityName: donationsTable.charityName,
    amount: donationsTable.amount,
  }).from(donationsTable).where(unbilled(userId));
  const byCharity = new Map<string, number>();
  for (const r of rows) byCharity.set(r.charityName, (byCharity.get(r.charityName) ?? 0) + toCents(r.amount));
  const subtotalCents = [...byCharity.values()].reduce((a, b) => a + b, 0);
  const feeCents = feeFor(subtotalCents);
  return {
    count: rows.length,
    subtotalCents,
    feeCents,
    totalCents: subtotalCents + feeCents,
    byCharity: [...byCharity].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents),
    nextBillingDate: nextBillingDate(),
  };
}

/** A bill that couldn't be charged blocks new stakes until it's paid. */
export async function unpaidInvoice(userId: number): Promise<Invoice | undefined> {
  const [invoice] = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.userId, userId), eq(invoicesTable.status, "failed"))).limit(1);
  return invoice;
}

export async function cardOf(userId: number) {
  const [card] = await db.select().from(paymentMethodsTable).where(eq(paymentMethodsTable.userId, userId)).limit(1);
  return card;
}

/**
 * Why the user can't put money on the line right now, if anything: no card on file, or a bill
 * we couldn't charge. Answered with HTTP 402 so the app can send them to the card screen.
 */
export async function stakesBlocked(userId: number): Promise<{ code: string; message: string } | null> {
  if (!(await cardOf(userId))) {
    return { code: "card_required", message: "Add a card first: it's charged once a month for your snoozes." };
  }
  const unpaid = await unpaidInvoice(userId);
  if (unpaid) {
    return { code: "payment_failed", message: `Your ${unpaid.period} bill of ${money(unpaid.totalCents)} couldn't be charged. Update your card in Billing.` };
  }
  return null;
}

// --- Monthly billing ---------------------------------------------------------------------------

/**
 * Turns owed donations into bills: last month's for everyone, plus anyone who already owes $50+.
 * `force` bills everything a user owes right now (test mode button).
 */
async function createInvoices(now: Date, force?: { userId: number }) {
  const monthStart = startOfMonth(now);
  const owed = await db.select({
    userId: donationsTable.userId,
    oldest: sql<Date>`min(${donationsTable.createdAt})`.mapWith((v: string | Date) => new Date(v)),
    totalCents: sql<number>`round(sum(${donationsTable.amount}) * 100)`.mapWith(Number),
  }).from(donationsTable)
    .where(and(
      eq(donationsTable.status, "pending"), isNull(donationsTable.invoiceId),
      force ? eq(donationsTable.userId, force.userId) : undefined,
    ))
    .groupBy(donationsTable.userId);

  for (const user of owed) {
    const early = !!force || user.totalCents >= EARLY_BILL_CENTS;
    if (!early && user.oldest >= monthStart) continue; // this month's: billed on the 1st
    await db.transaction(async (tx) => {
      const rows = await tx.select({ id: donationsTable.id, amount: donationsTable.amount })
        .from(donationsTable)
        .where(and(
          unbilled(user.userId),
          early ? undefined : lt(donationsTable.createdAt, monthStart),
        ))
        .for("update");
      const subtotalCents = rows.reduce((sum, r) => sum + toCents(r.amount), 0);
      if (subtotalCents <= 0) return;
      const feeCents = feeFor(subtotalCents);
      const [invoice] = await tx.insert(invoicesTable).values({
        userId: user.userId,
        period: early ? monthKey(now) : monthKey(new Date(monthStart.getTime() - 1)),
        subtotalCents,
        feeCents,
        totalCents: subtotalCents + feeCents,
        nextAttemptAt: now,
      }).returning();
      await tx.update(donationsTable).set({ invoiceId: invoice.id })
        .where(inArray(donationsTable.id, rows.map(r => r.id)));
    });
  }
}

/** Charges every bill that is due (new ones and scheduled retries). */
async function chargeDueInvoices(now: Date, onlyInvoiceId?: number) {
  const due = await db.select().from(invoicesTable).where(and(
    inArray(invoicesTable.status, ["pending", "failed"]),
    onlyInvoiceId ? eq(invoicesTable.id, onlyInvoiceId) : lte(invoicesTable.nextAttemptAt, now),
  ));
  for (const invoice of due) await chargeInvoice(invoice, now);
}

async function chargeInvoice(invoice: Invoice, now: Date) {
  // Claim it so two runs can never charge the same bill twice
  const [claimed] = await db.update(invoicesTable).set({ status: "processing" })
    .where(and(eq(invoicesTable.id, invoice.id), inArray(invoicesTable.status, ["pending", "failed"])))
    .returning();
  if (!claimed) return;

  const provider = paymentProvider();
  const card = await cardOf(invoice.userId);
  const attempt = invoice.attempts + 1;
  const result = card
    ? await provider.charge(card.token, invoice.totalCents, `WakeOrDonate ${invoice.period}`, `invoice-${invoice.id}-${attempt}`)
        .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Charge failed" }))
    : { ok: false as const, error: "No card on file" };

  if (!result.ok) {
    const retryIn = RETRY_DAYS[invoice.attempts];
    await db.update(invoicesTable).set({
      status: "failed",
      attempts: attempt,
      lastError: result.error,
      nextAttemptAt: retryIn === undefined ? null : new Date(now.getTime() + days(retryIn)),
    }).where(eq(invoicesTable.id, invoice.id));
    return;
  }

  const piggy = await piggyBank();
  await db.transaction(async (tx) => {
    await tx.update(invoicesTable).set({
      status: "paid", attempts: attempt, lastError: null, nextAttemptAt: null,
      provider: provider.name, providerChargeId: result.chargeId, paidAt: now,
    }).where(eq(invoicesTable.id, invoice.id));
    const billed = await tx.update(donationsTable).set({ status: "billed" })
      .where(eq(donationsTable.invoiceId, invoice.id))
      .returning({ charityId: donationsTable.charityId, amount: donationsTable.amount });
    // Snoozes from "decide later" alarms: the money lands in the piggy bank
    const piggyCents = billed.filter(d => d.charityId === piggy?.id).reduce((s, d) => s + toCents(d.amount), 0);
    if (piggyCents > 0) {
      await tx.insert(piggyDepositsTable).values({
        userId: invoice.userId,
        invoiceId: invoice.id,
        amountCents: piggyCents,
        remainingCents: piggyCents,
        availableAt: new Date(now.getTime() + days(PIGGY_LOCK_DAYS)),
        expiresAt: new Date(now.getTime() + days(PIGGY_LOCK_DAYS + PIGGY_CLAIM_DAYS)),
      });
      await tx.insert(piggyActivityTable).values({ userId: invoice.userId, type: "deposit", amountCents: piggyCents });
    }
  });
  await emailReceipt(invoice.id).catch(e => console.error("receipt email failed", e));
}

/** Pays an unpaid bill right now (after the user fixed their card). */
export async function retryInvoice(invoiceId: number, now = new Date()) {
  await chargeDueInvoices(now, invoiceId);
}

// --- Receipts ----------------------------------------------------------------------------------

/** One bill with what it paid for, per charity, and whether each part reached the charity yet. */
export async function invoiceDetails(invoiceId: number, userId: number) {
  const [invoice] = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.userId, userId))).limit(1);
  if (!invoice) return undefined;
  const rows = await db.select({
    charityName: donationsTable.charityName,
    amount: donationsTable.amount,
    status: donationsTable.status,
    reason: donationsTable.reason,
    receiptUrl: payoutsTable.receiptUrl,
    sentAt: payoutsTable.sentAt,
  }).from(donationsTable)
    .leftJoin(payoutsTable, eq(donationsTable.payoutId, payoutsTable.id))
    .where(eq(donationsTable.invoiceId, invoiceId));
  const lines = new Map<string, { charityName: string; cents: number; count: number; sent: boolean; sentAt: Date | null; receiptUrl: string | null }>();
  for (const r of rows) {
    const line = lines.get(r.charityName) ?? { charityName: r.charityName, cents: 0, count: 0, sent: true, sentAt: null, receiptUrl: null };
    line.cents += toCents(r.amount);
    line.count += 1;
    line.sent &&= r.status === "sent";
    line.sentAt = r.sentAt ?? line.sentAt;
    line.receiptUrl = r.receiptUrl ?? line.receiptUrl;
    lines.set(r.charityName, line);
  }
  return { invoice, lines: [...lines.values()].sort((a, b) => b.cents - a.cents) };
}

async function emailReceipt(invoiceId: number) {
  if (!emailConfigured()) return;
  const [row] = await db.select({ invoice: invoicesTable, user: usersTable }).from(invoicesTable)
    .innerJoin(usersTable, eq(invoicesTable.userId, usersTable.id))
    .where(eq(invoicesTable.id, invoiceId)).limit(1);
  if (!row) return;
  const details = await invoiceDetails(invoiceId, row.user.id);
  if (!details) return;
  const { invoice } = details;
  const lines = details.lines.map(l => `  ${l.charityName}: ${money(l.cents)}`).join("\n");
  await sendEmail(
    row.user.email,
    `Your WakeOrDonate receipt for ${invoice.period}: ${money(invoice.totalCents)}`,
    `Hi ${row.user.name},\n\nWe charged ${money(invoice.totalCents)} to your card for ${invoice.period}.\n\n`
      + `Donations:\n${lines}\nSubtotal: ${money(invoice.subtotalCents)}\nOur fee (10%, min $1): ${money(invoice.feeCents)}\n`
      + `Total: ${money(invoice.totalCents)}\n\nWe pass the donations on to each charity in our monthly payout and post the `
      + `charities' receipts in the app (Profile > Billing & receipts).\n\nWakeOrDonate is the donor of record, so these `
      + `payments aren't tax-deductible for you.`,
  );
}

// --- Piggy bank --------------------------------------------------------------------------------

export async function piggySummary(userId: number, now = new Date()) {
  const piggy = await piggyBank();
  const deposits = await db.select().from(piggyDepositsTable)
    .where(and(eq(piggyDepositsTable.userId, userId), gt(piggyDepositsTable.remainingCents, 0)))
    .orderBy(asc(piggyDepositsTable.createdAt));
  const [pending] = piggy ? await db.select({
    cents: sql<number>`coalesce(round(sum(${donationsTable.amount}) * 100), 0)`.mapWith(Number),
  }).from(donationsTable).where(and(
    eq(donationsTable.userId, userId), eq(donationsTable.charityId, piggy.id), eq(donationsTable.status, "pending"),
  )) : [{ cents: 0 }];
  const activity = await db.select().from(piggyActivityTable)
    .where(eq(piggyActivityTable.userId, userId)).orderBy(sql`${piggyActivityTable.createdAt} desc`).limit(50);
  const balanceCents = deposits.reduce((s, d) => s + d.remainingCents, 0);
  const withdrawableCents = deposits
    .filter(d => d.availableAt <= now && d.expiresAt > now)
    .reduce((s, d) => s + d.remainingCents, 0);
  return {
    balanceCents,              // paid in, can be donated anytime
    withdrawableCents,         // past the 90-day lock, can be taken back
    pendingCents: pending.cents, // on this month's bill, not paid in yet
    deposits: deposits.map(d => ({
      amountCents: d.amountCents, remainingCents: d.remainingCents,
      availableAt: d.availableAt, expiresAt: d.expiresAt,
    })),
    activity,
  };
}

export class PiggyError extends Error {}

/** Takes `cents` from the oldest deposits first (optionally only withdrawable ones). */
async function takeFromDeposits(tx: Tx, userId: number, cents: number, now: Date, withdrawableOnly: boolean) {
  const deposits = await tx.select().from(piggyDepositsTable)
    .where(and(
      eq(piggyDepositsTable.userId, userId), gt(piggyDepositsTable.remainingCents, 0),
      withdrawableOnly ? and(lte(piggyDepositsTable.availableAt, now), gt(piggyDepositsTable.expiresAt, now)) : undefined,
    ))
    .orderBy(asc(piggyDepositsTable.createdAt))
    .for("update");
  const available = deposits.reduce((s, d) => s + d.remainingCents, 0);
  if (available < cents) {
    throw new PiggyError(withdrawableOnly
      ? `Only ${money(available)} can be taken back right now`
      : `Your piggy bank has ${money(available)}`);
  }
  const taken: { invoiceId: number; cents: number }[] = [];
  let left = cents;
  for (const d of deposits) {
    if (left === 0) break;
    const part = Math.min(left, d.remainingCents);
    await tx.update(piggyDepositsTable).set({ remainingCents: d.remainingCents - part }).where(eq(piggyDepositsTable.id, d.id));
    taken.push({ invoiceId: d.invoiceId, cents: part });
    left -= part;
  }
  return taken;
}

/** Sends piggy bank money to a charity; it goes out with the next monthly payout. */
export async function donateFromPiggy(userId: number, charity: Charity, cents: number, now = new Date()) {
  await db.transaction(async (tx) => {
    await takeFromDeposits(tx, userId, cents, now, false);
    await recordDonation(tx, { userId, alarmId: null, charity, amount: cents / 100, reason: "piggy", status: "billed" });
    await tx.insert(piggyActivityTable).values({ userId, type: "donate", amountCents: cents, charityName: charity.name });
  });
}

/** Refunds piggy bank money that is past its 90-day lock back to the card it came from. */
export async function withdrawFromPiggy(userId: number, cents: number | undefined, now = new Date()) {
  const summary = await piggySummary(userId, now);
  const amount = cents ?? summary.withdrawableCents;
  if (amount <= 0) throw new PiggyError("Nothing can be taken back yet: piggy bank money unlocks 90 days after it's paid");
  const provider = paymentProvider();
  await db.transaction(async (tx) => {
    const taken = await takeFromDeposits(tx, userId, amount, now, true);
    for (const part of taken) {
      const [invoice] = await tx.select().from(invoicesTable).where(eq(invoicesTable.id, part.invoiceId)).limit(1);
      if (!invoice?.providerChargeId) throw new PiggyError("Original payment not found");
      const refund = await provider.refund(invoice.providerChargeId, part.cents);
      if (!refund.ok) throw new PiggyError(refund.error);
      await tx.update(invoicesTable).set({ refundedCents: invoice.refundedCents + part.cents }).where(eq(invoicesTable.id, invoice.id));
    }
    await tx.insert(piggyActivityTable).values({ userId, type: "withdraw", amountCents: amount });
  });
  return amount;
}

/** Unclaimed piggy bank money past its claim window: we donate it to a charity of our choice. */
async function expirePiggyBanks(now: Date) {
  const expired = await db.select().from(piggyDepositsTable)
    .where(and(gt(piggyDepositsTable.remainingCents, 0), lte(piggyDepositsTable.expiresAt, now)));
  const piggy = await piggyBank();
  if (!piggy) return;
  for (const d of expired) {
    await db.transaction(async (tx) => {
      const [claimed] = await tx.update(piggyDepositsTable).set({ remainingCents: 0 })
        .where(and(eq(piggyDepositsTable.id, d.id), gt(piggyDepositsTable.remainingCents, 0))).returning();
      if (!claimed) return;
      await recordDonation(tx, { userId: d.userId, alarmId: null, charity: piggy, amount: d.remainingCents / 100, reason: "piggy", status: "billed" });
      await tx.insert(piggyActivityTable).values({ userId: d.userId, type: "forfeit", amountCents: d.remainingCents });
    });
  }
}

// --- Payouts to charities (admin) --------------------------------------------------------------

/**
 * Groups every charged donation that hasn't gone out yet into one payout per charity. Money still
 * sitting in piggy banks stays out; expired piggy money appears as "our choice".
 */
export async function preparePayouts(now = new Date()) {
  const piggy = await piggyBank();
  await db.transaction(async (tx) => {
    const rows = await tx.select({ id: donationsTable.id, charityId: donationsTable.charityId, charityName: donationsTable.charityName, amount: donationsTable.amount, reason: donationsTable.reason })
      .from(donationsTable)
      .where(and(eq(donationsTable.status, "billed"), isNull(donationsTable.payoutId)))
      .for("update");
    const groups = new Map<number, { name: string; cents: number; ids: number[] }>();
    for (const r of rows) {
      const isPiggy = r.charityId === piggy?.id;
      // Piggy money parked by a snooze stays in the bank; only expired money ("forfeit") is paid out
      if (isPiggy && r.reason !== "piggy") continue;
      const g = groups.get(r.charityId) ?? { name: isPiggy ? "Our choice (unclaimed piggy banks)" : r.charityName, cents: 0, ids: [] };
      g.cents += toCents(r.amount);
      g.ids.push(r.id);
      groups.set(r.charityId, g);
    }
    for (const [charityId, g] of groups) {
      const [payout] = await tx.insert(payoutsTable).values({
        batch: monthKey(now), charityId, charityName: g.name, amountCents: g.cents,
      }).returning();
      await tx.update(donationsTable).set({ payoutId: payout.id }).where(inArray(donationsTable.id, g.ids));
    }
  });
}

export async function markPayoutSent(payoutId: number, receiptUrl: string | null, note: string | null, now = new Date()) {
  await db.transaction(async (tx) => {
    const [payout] = await tx.update(payoutsTable).set({ status: "sent", receiptUrl, note, sentAt: now })
      .where(eq(payoutsTable.id, payoutId)).returning();
    if (!payout) return;
    await tx.update(donationsTable).set({ status: "sent" }).where(eq(donationsTable.payoutId, payoutId));
  });
}

// --- Scheduler -----------------------------------------------------------------------------------

let inFlight: Promise<void> | null = null;

/** Bills, retries and expires piggy banks. Concurrent callers share one run. */
export function runBilling(now = new Date(), force?: { userId: number }): Promise<void> {
  if (!inFlight) {
    inFlight = (async () => {
      try {
        await createInvoices(now, force);
        await chargeDueInvoices(now);
        await expirePiggyBanks(now);
      } catch (e) {
        console.error("billing run failed", e);
      } finally {
        inFlight = null;
      }
    })();
  }
  return inFlight;
}

const BILLING_TICK_MS = 60 * 60 * 1000;

export function startBillingScheduler() {
  setInterval(() => void runBilling(), BILLING_TICK_MS);
  void runBilling();
}
