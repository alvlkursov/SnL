import { Router } from "express";
import { db } from "@workspace/db";
import { charitiesTable, userFavoriteCharitiesTable } from "@workspace/db/schema";
import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import { authMiddleware, getUserId } from "../lib/auth.js";
import { syncCharityCatalog } from "../lib/charityCatalog.js";
import { parseBody, setFavoritesSchema } from "../lib/validation.js";
import { MAX_FAVORITE_CHARITIES } from "../lib/rules.js";

const router = Router();

syncCharityCatalog().catch(e => console.error("charity catalog sync failed", e));

async function favoritesOf(userId: number) {
  const rows = await db.select({ charity: charitiesTable })
    .from(userFavoriteCharitiesTable)
    .innerJoin(charitiesTable, eq(userFavoriteCharitiesTable.charityId, charitiesTable.id))
    .where(eq(userFavoriteCharitiesTable.userId, userId))
    .orderBy(asc(charitiesTable.name));
  return rows.map(r => r.charity);
}

// The user's favorites (alarms with category 'favorite' donate to one of these)
router.get("/favorites", authMiddleware, async (req, res) => {
  res.json(await favoritesOf(getUserId(req)));
});

router.put("/favorites", authMiddleware, async (req, res) => {
  const body = parseBody(setFavoritesSchema, req, res);
  if (!body) return;
  const userId = getUserId(req);
  const ids = [...new Set(body.charityIds)];
  if (ids.length > MAX_FAVORITE_CHARITIES) {
    res.status(400).json({ error: "Bad Request", message: `Pick up to ${MAX_FAVORITE_CHARITIES} favorite charities` });
    return;
  }
  const valid = ids.length
    ? await db.select({ id: charitiesTable.id }).from(charitiesTable)
      .where(and(inArray(charitiesTable.id, ids), notInArray(charitiesTable.category, ["hated", "piggy"])))
    : [];
  if (valid.length !== ids.length) {
    res.status(400).json({ error: "Bad Request", message: "Unknown charity" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(userFavoriteCharitiesTable).where(eq(userFavoriteCharitiesTable.userId, userId));
    if (ids.length) {
      await tx.insert(userFavoriteCharitiesTable).values(ids.map(charityId => ({ userId, charityId })));
    }
  });
  res.json(await favoritesOf(userId));
});

// ?category=recommended | hated | catalog (everything except rivals) | favorite (needs auth)
router.get("/", async (req, res, next) => {
  const category = String(req.query.category ?? "");
  if (category === "favorite") {
    authMiddleware(req, res, async () => {
      try {
        res.json(await favoritesOf(getUserId(req)));
      } catch (e) {
        next(e);
      }
    });
    return;
  }
  const query = db.select().from(charitiesTable);
  // The piggy bank is a system destination, never a pickable charity
  const charities = category === "catalog"
    ? await query.where(notInArray(charitiesTable.category, ["hated", "piggy"])).orderBy(asc(charitiesTable.cause), asc(charitiesTable.name))
    : category && category !== "piggy"
      ? await query.where(eq(charitiesTable.category, category)).orderBy(desc(charitiesTable.isHot), asc(charitiesTable.name))
      : await query.where(notInArray(charitiesTable.category, ["piggy"])).orderBy(asc(charitiesTable.name));
  res.json(charities);
});

export default router;
