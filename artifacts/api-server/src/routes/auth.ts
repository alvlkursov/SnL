import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, sessionsTable, passwordResetsTable, type User } from "@workspace/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import crypto from "crypto";
import { hashPassword, verifyPassword, isLegacyHash, createSession, removeSession, authMiddleware, getUserId } from "../lib/auth.js";
import {
  parseBody, registerSchema, loginSchema, updateMeSchema, deleteAccountSchema, deleteAccountWebSchema,
  forgotPasswordSchema, resetPasswordSchema,
} from "../lib/validation.js";
import { emailConfigured, sendEmail } from "../lib/email.js";

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

// Permanently deletes the user. Sessions, alarms, alarm history and donation records cascade.
async function deleteUser(userId: number) {
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}

// In-app deletion (Google Play requirement); re-confirms the password
router.delete("/me", authMiddleware, async (req, res) => {
  const body = parseBody(deleteAccountSchema, req, res);
  if (!body) return;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, getUserId(req))).limit(1);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await verifyPassword(body.password, user.passwordHash))) {
    res.status(403).json({ error: "Forbidden", message: "Wrong password" });
    return;
  }
  await deleteUser(user.id);
  res.json({ success: true, message: "Account deleted" });
});

// Deletion from the public web page, for people who no longer have the app installed
router.post("/delete-account", async (req, res) => {
  const body = parseBody(deleteAccountWebSchema, req, res);
  if (!body) return;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, body.email)).limit(1);
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid email or password" });
    return;
  }
  await deleteUser(user.id);
  res.json({ success: true, message: "Account deleted" });
});

// --- Forgot password: a 6-digit code by email, then a new password ---

const RESET_CODE_TTL_MS = 15 * 60_000;
const RESET_RESEND_MS = 60_000; // one email a minute per account
const RESET_MAX_ATTEMPTS = 5;

function hashResetCode(userId: number, code: string): string {
  return crypto.createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

router.post("/forgot-password", async (req, res) => {
  const body = parseBody(forgotPasswordSchema, req, res);
  if (!body) return;
  if (!emailConfigured()) {
    console.error("forgot-password: RESEND_API_KEY is not set, can't email reset codes");
    res.status(503).json({ error: "Unavailable", message: "Password reset isn't available right now. Please contact support." });
    return;
  }
  // Same answer whether or not the account exists, so emails can't be probed
  const done = () => res.json({ success: true, message: "If an account exists for this email, we sent a code to it." });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, body.email)).limit(1);
  if (!user) { done(); return; }

  const [recent] = await db.select().from(passwordResetsTable)
    .where(and(eq(passwordResetsTable.userId, user.id), gt(passwordResetsTable.createdAt, new Date(Date.now() - RESET_RESEND_MS))))
    .limit(1);
  if (recent) { done(); return; }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await db.delete(passwordResetsTable).where(eq(passwordResetsTable.userId, user.id));
  await db.insert(passwordResetsTable).values({
    userId: user.id,
    codeHash: hashResetCode(user.id, code),
    expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
  });
  await sendEmail(
    user.email,
    `${code} is your WakeOrDonate code`,
    `Hi ${user.name},\n\nYour code to reset your WakeOrDonate password is ${code}. It expires in 15 minutes.\n\nIf you didn't ask for this, ignore this email; your password stays the same.`,
  );
  done();
});

router.post("/reset-password", async (req, res) => {
  const body = parseBody(resetPasswordSchema, req, res);
  if (!body) return;
  const invalid = () => res.status(400).json({ error: "Bad Request", message: "Wrong or expired code. Request a new one." });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, body.email)).limit(1);
  if (!user) { invalid(); return; }
  const [reset] = await db.select().from(passwordResetsTable)
    .where(and(eq(passwordResetsTable.userId, user.id), gt(passwordResetsTable.expiresAt, new Date())))
    .orderBy(desc(passwordResetsTable.createdAt))
    .limit(1);
  if (!reset || reset.attempts >= RESET_MAX_ATTEMPTS) { invalid(); return; }

  const expected = Buffer.from(reset.codeHash, "hex");
  const candidate = Buffer.from(hashResetCode(user.id, body.code), "hex");
  if (!crypto.timingSafeEqual(candidate, expected)) {
    await db.update(passwordResetsTable).set({ attempts: reset.attempts + 1 }).where(eq(passwordResetsTable.id, reset.id));
    invalid();
    return;
  }

  // New password; every old session (e.g. a lost phone) is signed out
  const [updated] = await db.update(usersTable).set({ passwordHash: await hashPassword(body.password) })
    .where(eq(usersTable.id, user.id)).returning();
  await db.delete(passwordResetsTable).where(eq(passwordResetsTable.userId, user.id));
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, user.id));
  const token = await createSession(user.id);
  res.json({ user: publicUser(updated), token });
});

router.post("/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    await removeSession(authHeader.slice(7));
  }
  res.json({ success: true, message: "Logged out" });
});

export default router;
