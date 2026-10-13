import { pgTable, serial, integer, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { alarmsTable } from "./alarms";
import { charitiesTable } from "./charities";

export const donationsTable = pgTable("donations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  alarmId: integer("alarm_id").references(() => alarmsTable.id, { onDelete: "set null" }), // null for voluntary; history survives alarm deletion
  charityId: integer("charity_id").notNull().references(() => charitiesTable.id),
  charityName: text("charity_name").notNull(),
  amount: real("amount").notNull(),
  reason: text("reason").notNull(), // 'snooze' | 'missed' | 'voluntary'
  // 'pending': owed, on this month's bill · 'billed': charged, waiting for the monthly payout ·
  // 'sent': paid out to the charity · 'completed': legacy rows from before billing existed
  status: text("status").notNull().default("pending"),
  invoiceId: integer("invoice_id"), // the monthly bill that charged it
  payoutId: integer("payout_id"), // the transfer that delivered it to the charity
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDonationSchema = createInsertSchema(donationsTable).omit({ id: true, createdAt: true });
export type InsertDonation = z.infer<typeof insertDonationSchema>;
export type Donation = typeof donationsTable.$inferSelect;
