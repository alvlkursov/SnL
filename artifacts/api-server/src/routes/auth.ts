import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, generateToken, storeToken, removeToken, authMiddleware } from "../lib/auth.js";

const router = Router();

router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      res.status(400).json({ error: "Bad Request", message: "Email, password and name are required" });
      return;
    }
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Conflict", message: "Email already exists" });
      return;
    }
    const [user] = await db.insert(usersTable).values({
      email,
      passwordHash: hashPassword(password),
      name,
    }).returning();
    const token = generateToken(user.id);
    storeToken(token, user.id);
    res.status(201).json({
      user: {
        id: user.id, email: user.email, name: user.name,
        paypalEmail: user.paypalEmail, totalDonated: user.totalDonated,
        alarmsTriggered: user.alarmsTriggered, alarmsDismissed: user.alarmsDismissed,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error", message: String(e) });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid email or password" });
      return;
    }
    const token = generateToken(user.id);
    storeToken(token, user.id);
    res.json({
      user: {
        id: user.id, email: user.email, name: user.name,
        paypalEmail: user.paypalEmail, totalDonated: user.totalDonated,
        alarmsTriggered: user.alarmsTriggered, alarmsDismissed: user.alarmsDismissed,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error", message: String(e) });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    res.json({
      id: user.id, email: user.email, name: user.name,
      paypalEmail: user.paypalEmail, totalDonated: user.totalDonated,
      alarmsTriggered: user.alarmsTriggered, alarmsDismissed: user.alarmsDismissed,
      createdAt: user.createdAt,
    });
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error", message: String(e) });
  }
});

router.post("/logout", (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    removeToken(authHeader.slice(7));
  }
  res.json({ success: true, message: "Logged out" });
});

export default router;
