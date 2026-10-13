import { testProvider } from "./test.js";

/**
 * A card processor. Swappable: the test provider works today; Rapyd / Cardcom / Grow plug in here
 * once there is a merchant account. Real providers collect card details on their own hosted page
 * (so card numbers never touch our server) and hand us back a reusable token.
 */
export interface PaymentProvider {
  name: string;
  /** Test mode only: checks a card with a $1 authorization (voided at once) and returns a token. */
  saveTestCard?(card: { number: string; expMonth: number; expYear: number; cvc: string }): Promise<SavedCard>;
  /** Charges a saved card. The idempotency key makes a retried request never charge twice. */
  charge(token: string, amountCents: number, description: string, idempotencyKey: string): Promise<ChargeResult>;
  /** Returns part of an earlier charge (piggy bank withdrawals). */
  refund(chargeId: string, amountCents: number): Promise<{ ok: true } | { ok: false; error: string }>;
}

export interface SavedCard {
  token: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export type ChargeResult = { ok: true; chargeId: string } | { ok: false; error: string };

export class CardError extends Error {}

export function paymentProvider(): PaymentProvider {
  const name = process.env.PAYMENTS_PROVIDER || "test";
  if (name === "test") return testProvider;
  throw new Error(`Unknown PAYMENTS_PROVIDER "${name}"`);
}
