import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { donationsTable, invoicesTable, payoutsTable, piggyDepositsTable } from "@workspace/db/schema";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { page } from "./legal.js";
import { parseId, markPayoutSentSchema } from "../lib/validation.js";
import { markPayoutSent, money, monthKey, preparePayouts, runBilling } from "../lib/billing.js";
import { PIGGY_BANK_NAME } from "../lib/charityCatalog.js";

// The owner's back office: monthly totals, payouts to charities and their receipts.
// Protected by the ADMIN_PASSWORD secret (browser login prompt; any username).
const router = Router();

function adminAuth(req: Request, res: Response, next: NextFunction) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    res.status(503).send(page("Admin", "<h1>Admin is off</h1><p>Set the ADMIN_PASSWORD secret on the server to turn it on.</p>"));
    return;
  }
  const header = req.headers.authorization ?? "";
  const given = header.startsWith("Basic ") ? Buffer.from(header.slice(6), "base64").toString().split(":").slice(1).join(":") : "";
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(password).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    res.set("WWW-Authenticate", 'Basic realm="WakeOrDonate admin"').status(401).send("Login required");
    return;
  }
  next();
}

router.use(adminAuth);

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

router.get("/", async (req, res) => {
  const base = req.baseUrl; // absolute links: works with or without a trailing slash
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month)) ? String(req.query.month) : monthKey(new Date());

  const [bills] = await db.select({
    count: sql<number>`count(*)`.mapWith(Number),
    paid: sql<number>`count(*) filter (where ${invoicesTable.status} = 'paid')`.mapWith(Number),
    failed: sql<number>`count(*) filter (where ${invoicesTable.status} = 'failed')`.mapWith(Number),
    collected: sql<number>`coalesce(sum(${invoicesTable.totalCents}) filter (where ${invoicesTable.status} = 'paid'), 0)`.mapWith(Number),
    fees: sql<number>`coalesce(sum(${invoicesTable.feeCents}) filter (where ${invoicesTable.status} = 'paid'), 0)`.mapWith(Number),
    refunded: sql<number>`coalesce(sum(${invoicesTable.refundedCents}), 0)`.mapWith(Number),
  }).from(invoicesTable).where(eq(invoicesTable.period, month));

  const [owed] = await db.select({
    cents: sql<number>`coalesce(round(sum(${donationsTable.amount}) * 100), 0)`.mapWith(Number),
    users: sql<number>`count(distinct ${donationsTable.userId})`.mapWith(Number),
  }).from(donationsTable).where(eq(donationsTable.status, "pending"));

  const [ready] = await db.select({
    cents: sql<number>`coalesce(round(sum(${donationsTable.amount}) * 100), 0)`.mapWith(Number),
  }).from(donationsTable).where(and(eq(donationsTable.status, "billed"), sql`${donationsTable.payoutId} is null`, sql`not (${donationsTable.charityName} = ${PIGGY_BANK_NAME} and ${donationsTable.reason} <> 'piggy')`));

  const [piggy] = await db.select({
    cents: sql<number>`coalesce(sum(${piggyDepositsTable.remainingCents}), 0)`.mapWith(Number),
  }).from(piggyDepositsTable).where(gt(piggyDepositsTable.remainingCents, 0));

  const payouts = await db.select().from(payoutsTable).orderBy(desc(payoutsTable.createdAt)).limit(200);
  const failed = await db.select().from(invoicesTable).where(eq(invoicesTable.status, "failed")).orderBy(desc(invoicesTable.createdAt)).limit(50);

  const payoutRows = payouts.map(p => `<tr>
    <td>${esc(p.batch)}</td><td>${esc(p.charityName)}</td><td class="num">${money(p.amountCents)}</td>
    <td>${p.status === "sent"
      ? `<span class="pill ok">sent ${date(p.sentAt)}</span>${p.receiptUrl ? ` · <a href="${esc(p.receiptUrl)}" target="_blank" rel="noopener">receipt</a>` : ""}${p.note ? `<br><span class="muted">${esc(p.note)}</span>` : ""}`
      : `<form class="inline" method="post" action="${base}/payouts/${p.id}/sent">
          <input name="receiptUrl" placeholder="Receipt link (from the charity)">
          <input name="note" placeholder="Note (optional)">
          <button>Mark sent</button></form>`}</td></tr>`).join("");

  const failedRows = failed.map(i => `<tr><td>#${i.id}</td><td>user ${i.userId}</td><td>${esc(i.period)}</td>
    <td class="num">${money(i.totalCents)}</td><td>${esc(i.lastError)}</td><td>${i.nextAttemptAt ? `retry ${date(i.nextAttemptAt)}` : "no more retries"}</td></tr>`).join("");

  res.send(page("Admin", `
<h1>WakeOrDonate admin</h1>
<form class="inline" method="get" action="${base}"><input name="month" value="${esc(month)}" placeholder="YYYY-MM"><button>Show month</button></form>

<h2>Bills for ${esc(month)}</h2>
<div class="cards">
  <div class="card">Bills<b>${bills.count}</b><span class="muted">${bills.paid} paid · ${bills.failed} failed</span></div>
  <div class="card">Collected<b>${money(bills.collected)}</b><span class="muted">incl. fees</span></div>
  <div class="card">Our fees<b>${money(bills.fees)}</b></div>
  <div class="card">Piggy refunds<b>${money(bills.refunded)}</b></div>
</div>

<h2>Right now</h2>
<div class="cards">
  <div class="card">Owed, not billed yet<b>${money(owed.cents)}</b><span class="muted">${owed.users} users · billed on the 1st</span></div>
  <div class="card">Charged, ready to pay out<b>${money(ready.cents)}</b></div>
  <div class="card">Held in piggy banks<b>${money(piggy.cents)}</b></div>
</div>
<p>
  <form class="inline" method="post" action="${base}/run-billing"><button>Run billing now</button>
  <span class="muted">Bills last month's donations and retries failed cards (also runs by itself every hour).</span></form>
</p>

<h2>Payouts to charities</h2>
<p class="muted">1) Prepare: groups everything charged into one payout per charity. 2) Send each charity its amount
(Every.org, the charity's site or a bank transfer). 3) Paste the charity's receipt link and mark it sent — users then see it in their receipts.</p>
<form class="inline" method="post" action="${base}/payouts/prepare"><button>Prepare payouts</button></form>
<table><tr><th>Batch</th><th>Charity</th><th class="num">Amount</th><th>Status</th></tr>${payoutRows || `<tr><td colspan="4" class="muted">No payouts yet</td></tr>`}</table>

<h2>Unpaid bills</h2>
<table><tr><th>Bill</th><th>User</th><th>Month</th><th class="num">Total</th><th>Error</th><th></th></tr>${failedRows || `<tr><td colspan="6" class="muted">None</td></tr>`}</table>
`));
});

router.post("/run-billing", async (req, res) => {
  await runBilling();
  res.redirect(303, req.baseUrl);
});

router.post("/payouts/prepare", async (req, res) => {
  await preparePayouts();
  res.redirect(303, req.baseUrl);
});

router.post("/payouts/:id/sent", async (req, res) => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  const body = markPayoutSentSchema.safeParse(req.body);
  if (!body.success) { res.status(400).send(page("Admin", `<p>${esc(body.error.issues[0]?.message)}</p><p><a href="${req.baseUrl}">Back</a></p>`)); return; }
  await markPayoutSent(id, body.data.receiptUrl || null, body.data.note || null);
  res.redirect(303, req.baseUrl);
});

export default router;
