import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, type User } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, isLegacyHash, createSession, removeSession, authMiddleware, getUserId } from "../lib/auth.js";
import { parseBody, registerSchema, loginSchema, updateMeSchema } from "../lib/validation.js";

const router = Router();

function publicUser(user: User) {
  return {
    id: user.id, email: user.email, name: user.name,
    paypalEmail: user.paypalEmail, totalDonated: user.totalDonated,
    alarmsTriggered: user.alarmsTriggered, alarmsDismissed: user.alarmsDismissed,
    timezone: user.timezone, createdAt: user.createdAt,
  };
}

router.post("/register", async (req, res) => {
  const body = parseBody(registerSchema, req, res);
  if (!body) return;
  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, body.email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Conflict", message: "Email already exists" });
    return;
  }
  const [user] = await db.insert(usersTable).values({
    email: body.email,
    passwordHash: await hashPassword(body.password),
    name: body.name,
    ...(body.timezone ? { timezone: body.timezone } : {}),
  }).returning();
  const token = await createSession(user.id);
  res.status(201).json({ user: publicUser(user), token });
});

router.post("/login", async (req, res) => {
  const body = parseBody(loginSchema, req, res);
  if (!body) return;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, body.email)).limit(1);
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid email or password" });
    return;
  }
  // Upgrade prototype-era password hashes on successful login
  if (isLegacyHash(user.passwordHash)) {
    await db.update(usersTable).set({ passwordHash: await hashPassword(body.password) }).where(eq(usersTable.id, user.id));
  }
  const token = await createSession(user.id);
  res.json({ user: publicUser(user), token });
});

router.get("/me", authMiddleware, async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, getUserId(req))).limit(1);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json(publicUser(user));
});

// The app reports its timezone on every launch so alarms are evaluated in local time
router.patch("/me", authMiddleware, async (req, res) => {
  const body = parseBody(updateMeSchema, req, res);
  if (!body) return;
  const changes = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  const [user] = Object.keys(changes).length
    ? await db.update(usersTable).set(changes).where(eq(usersTable.id, getUserId(req))).returning()
    : await db.select().from(usersTable).where(eq(usersTable.id, getUserId(req))).limit(1);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json(publicUser(user));
});

router.post("/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    await removeSession(authHeader.slice(7));
  }
  res.json({ success: true, message: "Logged out" });
});

export default router;
