import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { charitiesTable } from "./charities";

// The card a user's monthly bill is charged to. Only the processor's token is stored, never card numbers.
export const paymentMethodsTable = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'test' | 'rapyd' | ...
  token: text("token").notNull(),
  brand: text("brand").notNull(),
  last4: text("last4").notNull(),
  expMonth: integer("exp_month").notNull(),
  expYear: integer("exp_year").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One charge per user per month: every pending donation of the period plus our fee
export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  period: text("period").notNull(), // 'YYYY-MM' the donations belong to
  subtotalCents: integer("subtotal_cents").notNull(),
  feeCents: integer("fee_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'processing' | 'paid' | 'failed'
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  nextAttemptAt: timestamp("next_attempt_at"), // null once paid or out of retries
  provider: text("provider"),
  providerChargeId: text("provider_charge_id"),
  refundedCents: integer("refunded_cents").notNull().default(0), // piggy bank withdrawals
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Money sent to a charity: everything billed for it since the last payout, with the charity's receipt
export const payoutsTable = pgTable("payouts", {
  id: serial("id").primaryKey(),
  batch: text("batch").notNull(), // 'YYYY-MM' the payout was prepared in
  charityId: integer("charity_id").notNull().references(() => charitiesTable.id),
  charityName: text("charity_name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'sent'
  receiptUrl: text("receipt_url"),
  note: text("note"), // e.g. which charity got an unclaimed piggy bank
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Piggy bank money waiting for a decision. Locked for 90 days after it's paid, then the user can
// take it back for 30 days; after that we donate it. Donating it to a charity is allowed anytime.
export const piggyDepositsTable = pgTable("piggy_deposits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  remainingCents: integer("remaining_cents").notNull(),
  availableAt: timestamp("available_at").notNull(), // withdrawals allowed from here
  expiresAt: timestamp("expires_at").notNull(), // unclaimed money goes to a charity of our choice
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// What happened in a user's piggy bank, for their history screen
export const piggyActivityTable = pgTable("piggy_activity", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'deposit' | 'donate' | 'withdraw' | 'forfeit'
  amountCents: integer("amount_cents").notNull(),
  charityName: text("charity_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PaymentMethod = typeof paymentMethodsTable.$inferSelect;
export type Invoice = typeof invoicesTable.$inferSelect;
export type Payout = typeof payoutsTable.$inferSelect;
export type PiggyDeposit = typeof piggyDepositsTable.$inferSelect;
