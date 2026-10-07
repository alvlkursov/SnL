import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { alarmsTable } from "./alarms";
import { donationsTable } from "./donations";

// One row per time an alarm actually goes off (one per alarm per local day).
export const alarmEventsTable = pgTable("alarm_events", {
  id: serial("id").primaryKey(),
  alarmId: integer("alarm_id").notNull().references(() => alarmsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  localDate: text("local_date").notNull(), // YYYY-MM-DD in the user's timezone
  scheduledAt: timestamp("scheduled_at").notNull(),
  deadline: timestamp("deadline").notNull(), // missed if not dismissed by then (+ grace)
  status: text("status").notNull().default("ringing"), // 'ringing' | 'dismissed' | 'missed'
  snoozesUsed: integer("snoozes_used").notNull().default(0),
  missedDonationId: integer("missed_donation_id").references(() => donationsTable.id, { onDelete: "set null" }),
  acknowledged: boolean("acknowledged").notNull().default(false), // user has seen the "missed" screen
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("alarm_events_alarm_day_idx").on(t.alarmId, t.localDate),
  index("alarm_events_status_deadline_idx").on(t.status, t.deadline),
]);

export type AlarmEvent = typeof alarmEventsTable.$inferSelect;
