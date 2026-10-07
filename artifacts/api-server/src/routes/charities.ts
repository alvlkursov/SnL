import { Router } from "express";
import { db } from "@workspace/db";
import { charitiesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Seed default charities if none exist
async function seedCharities() {
  const existing = await db.select().from(charitiesTable).limit(1);
  if (existing.length > 0) return;

  await db.insert(charitiesTable).values([
    // Recommended (hot)
    { name: "WWF", description: "World Wildlife Fund — защита дикой природы", category: "recommended", isHot: true },
    { name: "UNICEF", description: "Помощь детям по всему миру", category: "recommended", isHot: true },
    { name: "Красный Крест", description: "Гуманитарная помощь в зонах кризиса", category: "recommended", isHot: false },
    { name: "Врачи без границ", description: "Медицинская помощь в горячих точках", category: "recommended", isHot: false },
    { name: "Save the Children", description: "Защита прав детей", category: "recommended", isHot: false },
    // Hated
    { name: "Anonymous Corp Lobby", description: "Лоббирование корпоративных интересов", category: "hated", isHot: false },
    { name: "Anti-Vax Foundation", description: "Распространение антипрививочной пропаганды", category: "hated", isHot: false },
    { name: "Flat Earth Society", description: "Продвижение псевдонаучных теорий", category: "hated", isHot: false },
    { name: "Spam Political PAC", description: "Спам-политическая организация", category: "hated", isHot: false },
    { name: "Fossil Fuel Lobby", description: "Лоббирование интересов нефтяной промышленности", category: "hated", isHot: false },
  ]);
}

seedCharities().catch(console.error);

router.get("/", async (req, res) => {
  const { category } = req.query;
  let charities;
  if (category && category !== "favorite") {
    charities = await db.select().from(charitiesTable).where(eq(charitiesTable.category, String(category)));
  } else {
    charities = await db.select().from(charitiesTable);
  }
  res.json(charities);
});

export default router;
