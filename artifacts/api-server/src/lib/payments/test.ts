import crypto from "crypto";
import { CardError, type PaymentProvider } from "./index.js";

// Test cards (same numbers Stripe and most processors use in their sandboxes). Nothing real is
// ever charged, and any other number is rejected so nobody types in a real card by mistake.
const TEST_CARDS: Record<string, { brand: string; behavior: "ok" | "declines_charges" | "fails_check" }> = {
  "4242424242424242": { brand: "Visa", behavior: "ok" },
  "5555555555554444": { brand: "Mastercard", behavior: "ok" },
  "4000000000000341": { brand: "Visa", behavior: "declines_charges" }, // saves fine, monthly charge fails
  "4000000000000002": { brand: "Visa", behavior: "fails_check" },       // declined at the $1 check
};

export const testProvider: PaymentProvider = {
  name: "test",

  async saveTestCard(card) {
    const test = TEST_CARDS[card.number];
    if (!test) throw new CardError("Test mode: use the test card 4242 4242 4242 4242");
    const now = new Date();
    if (card.expYear < now.getFullYear() || (card.expYear === now.getFullYear() && card.expMonth < now.getMonth() + 1)) {
      throw new CardError("This card has expired");
    }
    if (test.behavior === "fails_check") throw new CardError("The card was declined at the $1 check");
    return {
      token: `test_${test.behavior}_${crypto.randomBytes(8).toString("hex")}`,
      brand: test.brand,
      last4: card.number.slice(-4),
      expMonth: card.expMonth,
      expYear: card.expYear,
    };
  },

  async charge(token, amountCents, _description, idempotencyKey) {
    if (token.startsWith("test_declines_charges")) return { ok: false, error: "Card declined (insufficient funds)" };
    if (amountCents <= 0) return { ok: false, error: "Nothing to charge" };
    return { ok: true, chargeId: `test_ch_${crypto.createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 16)}` };
  },

  async refund() {
    return { ok: true };
  },
};
