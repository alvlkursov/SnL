import type { RestClientV5 } from "bybit-api";
import { describe, expect, it } from "vitest";
import { Market, roundPrice, roundQty, type Instrument } from "../src/bybit/market.js";
import type { Signal } from "../src/types.js";

const inst = (symbol: string, tickSize = "0.0001", qtyStep = "0.1") =>
  ({
    symbol,
    quoteCoin: "USDT",
    contractType: "LinearPerpetual",
    priceFilter: { tickSize },
    lotSizeFilter: { qtyStep, minOrderQty: qtyStep },
    leverageFilter: { maxLeverage: "50" },
  }) as unknown as Instrument;

const client = {
  getInstrumentsInfo: async () => ({
    retCode: 0,
    retMsg: "OK",
    result: { list: [inst("PEPEUSDT"), inst("1000PEPEUSDT"), inst("TRUMPUSDT")], nextPageCursor: "" },
  }),
} as unknown as RestClientV5;

const sig = (p: number): Signal => ({
  coin: "PEPE",
  side: "long",
  entryLow: p,
  entryHigh: p,
  targets: [p * 1.1],
  stop: p * 0.9,
});

describe("Market.resolve", () => {
  it("picks the contract whose price matches the signal", async () => {
    const m = new Market(client);
    const prices: Record<string, number> = { PEPEUSDT: 0.00001, "1000PEPEUSDT": 0.01 };
    const price = async (s: string) => prices[s];
    expect(await m.resolve("PEPE", sig(0.00001), price)).toMatchObject({ symbol: "PEPEUSDT", multiplier: 1 });
    // Only the 1000x contract listed, channel quotes the coin's own price → scale by 1000.
    const only1000 = async (s: string) => (s === "1000PEPEUSDT" ? 0.01 : undefined);
    expect(await m.resolve("PEPE", sig(0.00001), only1000)).toMatchObject({ symbol: "1000PEPEUSDT", multiplier: 1000 });
    // Channel already quotes the contract's price → no scaling.
    expect(await m.resolve("PEPE", sig(0.0101), price)).toMatchObject({ symbol: "1000PEPEUSDT", multiplier: 1 });
  });

  it("rejects unknown coins and mismatching prices", async () => {
    const m = new Market(client);
    expect(await m.resolve("NOPE", sig(1), async () => 1)).toEqual({ error: "NOPE: no USDT perpetual on Bybit" });
    expect(await m.resolve("TRUMP", sig(2), async () => 8)).toEqual({
      error: "TRUMP: market price does not match signal",
    });
  });
});

describe("rounding", () => {
  it("rounds price to tick and qty down to step", () => {
    const i = inst("X", "0.0005", "0.01");
    expect(roundPrice(i, 1.23456)).toBe("1.2345");
    expect(roundQty(i, 3.14159)).toBe("3.14");
    expect(roundQty(inst("Y", "0.1", "10"), 1234)).toBe("1230");
  });
});
