import { z } from "zod";
import type { Request, Response } from "express";
import { isValidTimezone } from "./time.js";

const timezone = z.string().refine(isValidTimezone, "Unknown timezone");

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().min(1).max(100),
  timezone: timezone.optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export const deleteAccountWebSchema = loginSchema;

export const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  timezone: timezone.optional(),
});

// Body of dismiss / snooze: the ring time the phone scheduled (epoch ms), when known
export const ringActionSchema = z.object({
  ringAt: z.number().int().positive().optional(),
});

export const setFavoritesSchema = z.object({
  charityIds: z.array(z.number().int().positive()).max(20),
});

export const voluntaryDonationSchema = z.object({
  amount: z.number().min(1).max(500),
  charityId: z.number().int().positive().optional(),
});


const alarmFields = {
  label: z.string().trim().min(1).max(100),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm"),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  isEnabled: z.boolean(),
  donationAmount: z.number().min(1).max(500),
  charityId: z.number().int().positive().nullable(),
  charityCategory: z.enum(["favorite", "recommended", "hated", "piggy"]).nullable(),
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

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Test mode only: real processors collect card details on their own hosted page
export const testCardSchema = z.object({
  number: z.string().transform(v => v.replace(/\D/g, "")).pipe(z.string().regex(/^\d{12,19}$/, "Enter a card number")),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(2024).max(2100),
  cvc: z.string().regex(/^\d{3,4}$/, "Enter the 3-digit code"),
});

export const piggyDonateSchema = z.object({
  charityId: z.number().int().positive(),
  amountCents: z.number().int().min(100, "At least $1").max(1_000_000),
});

export const piggyWithdrawSchema = z.object({
  amountCents: z.number().int().positive().max(1_000_000).optional(), // default: everything withdrawable
});

export const markPayoutSentSchema = z.object({
  receiptUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional(),
});
