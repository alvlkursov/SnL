import { Router } from "express";
import { db } from "@workspace/db";
import { charitiesTable, invoicesTable, paymentMethodsTable, piggyDepositsTable } from "@workspace/db/schema";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { authMiddleware, getUserId } from "../lib/auth.js";
import { parseBody, parseId, testCardSchema, piggyDonateSchema, piggyWithdrawSchema } from "../lib/validation.js";
import { CardError, paymentProvider } from "../lib/payments/index.js";
import {
  PiggyError, cardOf, donateFromPiggy, invoiceDetails, openBill, piggySummary, retryInvoice, runBilling,
  stakesBlocked, withdrawFromPiggy,
} from "../lib/billing.js";
import { FEE_PERCENT, MIN_FEE_CENTS, PIGGY_CLAIM_DAYS, PIGGY_LOCK_DAYS, days } from "../lib/rules.js";

const router = Router();
router.use(authMiddleware);

const testMode = () => paymentProvider().name === "test";

function publicCard(card: Awaited<ReturnType<typeof cardOf>>) {
  return card ? { brand: card.brand, last4: card.last4, expMonth: card.expMonth, expYear: card.expYear } : null;
}

// Everything for the Billing screen: card, what's on the next bill, past bills
router.get("/", async (req, res) => {
  const userId = getUserId(req);
  const invoices = await db.select().from(invoicesTable)
    .where(eq(invoicesTable.userId, userId)).orderBy(desc(invoicesTable.createdAt)).limit(24);
  res.json({
    testMode: testMode(),
    card: publicCard(await cardOf(userId)),
    blocked: await stakesBlocked(userId),
    fee: { percent: FEE_PERCENT, minCents: MIN_FEE_CENTS },
    current: await openBill(userId),
    invoices: invoices.map(i => ({
      id: i.id, period: i.period, totalCents: i.totalCents, status: i.status,
      lastError: i.lastError, nextAttemptAt: i.nextAttemptAt, paidAt: i.paidAt, createdAt: i.createdAt,
    })),
  });
});

router.get("/invoices/:id", async (req, res) => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  const details = await invoiceDetails(id, getUserId(req));
  if (!details) { res.status(404).json({ error: "Not Found" }); return; }
  const { invoice, lines } = details;
  res.json({
    id: invoice.id, period: invoice.period, status: invoice.status,
    subtotalCents: invoice.subtotalCents, feeCents: invoice.feeCents, totalCents: invoice.totalCents,
    refundedCents: invoice.refundedCents, paidAt: invoice.paidAt, lastError: invoice.lastError,
    lines,
  });
});

// Charge an unpaid bill now (after updating the card)
router.post("/invoices/:id/retry", async (req, res) => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  const userId = getUserId(req);
  const [invoice] = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, userId))).limit(1);
  if (!invoice) { res.status(404).json({ error: "Not Found" }); return; }
  if (invoice.status === "paid") { res.json({ status: "paid" }); return; }
  await retryInvoice(id);
  const [after] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
  res.json({ status: after.status, lastError: after.lastError });
});

// Test mode: save a test card after a simulated $1 check. Real processors use their hosted page.
router.post("/card", async (req, res) => {
  const provider = paymentProvider();
  if (!provider.saveTestCard) {
    res.status(400).json({ error: "Bad Request", message: "Cards are added on the payment page" });
    return;
  }
  const body = parseBody(testCardSchema, req, res);
  if (!body) return;
  try {
    const saved = await provider.saveTestCard(body);
    const userId = getUserId(req);
    const values = { provider: provider.name, ...saved };
    await db.insert(paymentMethodsTable).values({ userId, ...values })
      .onConflictDoUpdate({ target: paymentMethodsTable.userId, set: { ...values, createdAt: new Date() } });
    res.json({ card: publicCard(await cardOf(userId)) });
  } catch (e) {
    if (e instanceof CardError) { res.status(402).json({ error: "Payment Required", message: e.message }); return; }
    throw e;
  }
});

router.delete("/card", async (req, res) => {
  const userId = getUserId(req);
  const bill = await openBill(userId);
  if (bill.count > 0) {
    res.status(409).json({ error: "Conflict", message: "This card pays your open bill. Replace it with another card instead." });
    return;
  }
  await db.delete(paymentMethodsTable).where(eq(paymentMethodsTable.userId, userId));
  res.json({ success: true });
});

// Test mode: bill everything owed right now instead of waiting for the 1st of the month
router.post("/test/bill-now", async (req, res) => {
  if (!testMode()) { res.status(404).json({ error: "Not Found" }); return; }
  await runBilling(new Date(), { userId: getUserId(req) });
  res.json({ success: true });
});

// --- Piggy bank ---

router.get("/piggy", async (req, res) => {
  res.json({ ...await piggySummary(getUserId(req)), lockDays: PIGGY_LOCK_DAYS, claimDays: PIGGY_CLAIM_DAYS });
});

router.post("/piggy/donate", async (req, res) => {
  const body = parseBody(piggyDonateSchema, req, res);
  if (!body) return;
  const [charity] = await db.select().from(charitiesTable)
    .where(and(eq(charitiesTable.id, body.charityId), notInArray(charitiesTable.category, ["piggy"]))).limit(1);
  if (!charity) { res.status(404).json({ error: "Not Found", message: "Charity not found" }); return; }
  try {
    await donateFromPiggy(getUserId(req), charity, body.amountCents);
    res.json(await piggySummary(getUserId(req)));
  } catch (e) {
    if (e instanceof PiggyError) { res.status(400).json({ error: "Bad Request", message: e.message }); return; }
    throw e;
  }
});

router.post("/piggy/withdraw", async (req, res) => {
  const body = parseBody(piggyWithdrawSchema, req, res);
  if (!body) return;
  try {
    const amountCents = await withdrawFromPiggy(getUserId(req), body.amountCents);
    res.json({ amountCents, ...await piggySummary(getUserId(req)) });
  } catch (e) {
    if (e instanceof PiggyError) { res.status(400).json({ error: "Bad Request", message: e.message }); return; }
    throw e;
  }
});

// Test mode: pretend 90 days passed so the withdrawal can be tried today
router.post("/test/unlock-piggy", async (req, res) => {
  if (!testMode()) { res.status(404).json({ error: "Not Found" }); return; }
  const now = Date.now();
  await db.update(piggyDepositsTable).set({
    availableAt: new Date(now - 1000),
    expiresAt: new Date(now + days(PIGGY_CLAIM_DAYS)),
  }).where(eq(piggyDepositsTable.userId, getUserId(req)));
  res.json(await piggySummary(getUserId(req)));
});

export default router;
