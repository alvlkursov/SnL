import { pgTable, serial, text, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const charitiesTable = pgTable("charities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // 'recommended' | 'hated'
  logoUrl: text("logo_url"),
  isHot: boolean("is_hot").notNull().default(false),
  totalReceived: real("total_received").notNull().default(0),
});

export const insertCharitySchema = createInsertSchema(charitiesTable).omit({ id: true, totalReceived: true });
export type InsertCharity = z.infer<typeof insertCharitySchema>;
export type Charity = typeof charitiesTable.$inferSelect;
