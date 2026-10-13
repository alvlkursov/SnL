import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { promisify } from "util";
import { db } from "@workspace/db";
import { sessionsTable } from "@workspace/db/schema";
import { and, eq, gt } from "drizzle-orm";

const scrypt = promisify(crypto.scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// Stored format: "scrypt$<salt>$<hash>"
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

// Hashes created by the first prototype (unsalted sha256 + static pepper)
function legacyHash(password: string): string {
  return crypto.createHash("sha256").update(password + "wakeDonate2024").digest("hex");
}

export function isLegacyHash(stored: string): boolean {
  return !stored.startsWith("scrypt$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (isLegacyHash(stored)) {
    const candidate = Buffer.from(legacyHash(password));
    const expected = Buffer.from(stored);
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  }
  const [, salt, hashHex] = stored.split("$");
  const expected = Buffer.from(hashHex, "hex");
  const candidate = await scrypt(password, salt, expected.length);
  return crypto.timingSafeEqual(candidate, expected);
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export async function removeSession(token: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, hashToken(token)));
}

async function getUserIdFromToken(token: string): Promise<number | null> {
  const [session] = await db.select().from(sessionsTable)
    .where(and(eq(sessionsTable.tokenHash, hashToken(token)), gt(sessionsTable.expiresAt, new Date())))
    .limit(1);
  return session?.userId ?? null;
}

export function getUserId(req: Request): number {
  return (req as any).userId;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", message: "Missing or invalid token" });
    return;
  }
  try {
    const userId = await getUserIdFromToken(authHeader.slice(7));
    if (!userId) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid token" });
      return;
    }
    (req as any).userId = userId;
    next();
  } catch (e) {
    next(e);
  }
}
