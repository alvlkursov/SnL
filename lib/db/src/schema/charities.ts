import { pgTable, serial, text, real, boolean, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const charitiesTable = pgTable("charities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // 'recommended' (featured partners) | 'general' (catalog) | 'hated' (rivals) | 'piggy' (system: the piggy bank)
  cause: text("cause"), // e.g. 'Health', 'Animals' — groups the catalog
  website: text("website"),
  logoUrl: text("logo_url"),
  isHot: boolean("is_hot").notNull().default(false),
  totalReceived: real("total_received").notNull().default(0),
});

export const insertCharitySchema = createInsertSchema(charitiesTable).omit({ id: true, totalReceived: true });
export type InsertCharity = z.infer<typeof insertCharitySchema>;
export type Charity = typeof charitiesTable.$inferSelect;

// Charities a user picked as favorites (category 'favorite' on an alarm donates to one of these)
export const userFavoriteCharitiesTable = pgTable("user_favorite_charities", {
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  charityId: integer("charity_id").notNull().references(() => charitiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.charityId] })]);
