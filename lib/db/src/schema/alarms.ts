import { pgTable, serial, integer, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { charitiesTable } from "./charities";

export const alarmsTable = pgTable("alarms", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  time: text("time").notNull(), // HH:mm
  days: text("days").notNull(), // JSON array of 0-6
  isEnabled: boolean("is_enabled").notNull().default(true),
  donationAmount: real("donation_amount").notNull(),
  charityId: integer("charity_id").references(() => charitiesTable.id),
  charityCategory: text("charity_category"), // 'favorite' | 'recommended' | 'hated'
  confirmationMethod: text("confirmation_method").notNull().default("button"), // 'button' | 'math' | 'shake' | 'qr'
  snoozeEnabled: boolean("snooze_enabled").notNull().default(true),
  snoozeCount: integer("snooze_count").notNull().default(0),
  snoozeDurationMinutes: integer("snooze_duration_minutes").notNull().default(5),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAlarmSchema = createInsertSchema(alarmsTable).omit({ id: true, createdAt: true, updatedAt: true, snoozeCount: true });
export type InsertAlarm = z.infer<typeof insertAlarmSchema>;
export type Alarm = typeof alarmsTable.$inferSelect;
