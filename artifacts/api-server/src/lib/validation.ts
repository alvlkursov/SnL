import { z } from "zod";
import type { Request, Response } from "express";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const alarmFields = {
  label: z.string().trim().min(1).max(100),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm"),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  isEnabled: z.boolean(),
  donationAmount: z.number().min(1).max(500),
  charityId: z.number().int().positive().nullable(),
  charityCategory: z.enum(["favorite", "recommended", "hated"]).nullable(),
  confirmationMethod: z.enum(["button", "math", "shake", "qr"]),
  snoozeEnabled: z.boolean(),
  snoozeDurationMinutes: z.number().int().min(1).max(30),
};

export const createAlarmSchema = z.object({
  ...alarmFields,
  isEnabled: alarmFields.isEnabled.default(true),
  charityId: alarmFields.charityId.optional().default(null),
  charityCategory: alarmFields.charityCategory.optional().default("recommended"),
  confirmationMethod: alarmFields.confirmationMethod.default("button"),
  snoozeEnabled: alarmFields.snoozeEnabled.default(true),
  snoozeDurationMinutes: alarmFields.snoozeDurationMinutes.default(5),
});

// Only whitelisted fields can be updated; unknown keys (userId, snoozeCount, ...) are stripped
export const updateAlarmSchema = z.object(alarmFields).partial();

/** Parses req.body; on failure sends 400 and returns null. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, req: Request, res: Response): z.infer<T> | null {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    res.status(400).json({
      error: "Bad Request",
      message: issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid request",
    });
    return null;
  }
  return result.data;
}

/** Parses a positive integer route param; on failure sends 400 and returns null. */
export function parseId(raw: string, res: Response): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Bad Request", message: "Invalid id" });
    return null;
  }
  return id;
}
