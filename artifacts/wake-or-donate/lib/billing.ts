import { Alert } from "react-native";
import { router } from "expo-router";
import { BASE_URL } from "@/context/AuthContext";

/** An API error that keeps the HTTP status and the server's error code (e.g. 'card_required'). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export async function apiErrorFrom(res: Response, fallback: string): Promise<ApiError> {
  const json = await res.json().catch(() => ({}));
  return new ApiError(json.message ?? fallback, res.status, json.code);
}

/**
 * Money can't be put on the line without a card (or with an unpaid bill): explain and offer to fix
 * it. Returns true if the error was that, so callers can skip their generic error alert.
 */
export function handlePaymentRequired(e: unknown): boolean {
  if (!(e instanceof ApiError) || e.status !== 402) return false;
  const needsCard = e.code === "card_required";
  Alert.alert(
    needsCard ? "Add a card first" : "Payment needed",
    e.message,
    [
      { text: "Not now", style: "cancel" },
      { text: needsCard ? "Add card" : "Open billing", onPress: () => router.push(needsCard ? "/billing/card" : "/billing") },
    ],
  );
  return true;
}

export const formatCents = (cents: number) =>
  `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export function formatPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export interface Card { brand: string; last4: string; expMonth: number; expYear: number }

export interface BillingOverview {
  testMode: boolean;
  card: Card | null;
  blocked: { code: string; message: string } | null;
  fee: { percent: number; minCents: number };
  current: {
    count: number; subtotalCents: number; feeCents: number; totalCents: number;
    byCharity: { name: string; cents: number }[];
    nextBillingDate: string;
  };
  invoices: {
    id: number; period: string; totalCents: number; status: "pending" | "processing" | "paid" | "failed";
    lastError: string | null; nextAttemptAt: string | null; paidAt: string | null; createdAt: string;
  }[];
}

export interface InvoiceDetails {
  id: number; period: string; status: string;
  subtotalCents: number; feeCents: number; totalCents: number; refundedCents: number;
  paidAt: string | null; lastError: string | null;
  lines: { charityName: string; cents: number; count: number; sent: boolean; sentAt: string | null; receiptUrl: string | null }[];
}

export interface PiggySummary {
  balanceCents: number; withdrawableCents: number; pendingCents: number;
  lockDays: number; claimDays: number;
  deposits: { amountCents: number; remainingCents: number; availableAt: string; expiresAt: string }[];
  activity: { id: number; type: "deposit" | "donate" | "withdraw" | "forfeit"; amountCents: number; charityName: string | null; createdAt: string }[];
}

/** Calls the billing API as the signed-in user; throws ApiError with the server's message. */
export async function billingApi<T>(token: string | null, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}/billing${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw await apiErrorFrom(res, "Something went wrong");
  return (await res.json()) as T;
}
