import { pgTable, serial, integer, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { alarmsTable } from "./alarms";
import { charitiesTable } from "./charities";

export const donationsTable = pgTable("donations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  alarmId: integer("alarm_id").notNull().references(() => alarmsTable.id, { onDelete: "cascade" }),
  charityId: integer("charity_id").notNull().references(() => charitiesTable.id),
  charityName: text("charity_name").notNull(),
  amount: real("amount").notNull(),
  reason: text("reason").notNull(), // 'snooze' | 'missed'
  status: text("status").notNull().default("completed"), // 'pending' | 'completed' | 'failed'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDonationSchema = createInsertSchema(donationsTable).omit({ id: true, createdAt: true });
export type InsertDonation = z.infer<typeof insertDonationSchema>;
export type Donation = typeof donationsTable.$inferSelect;
