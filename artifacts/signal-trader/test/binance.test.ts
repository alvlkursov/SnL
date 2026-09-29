import { afterEach, describe, expect, it, vi } from "vitest";
import { BinanceSpot } from "../src/backtest/binance.js";

afterEach(() => vi.unstubAllGlobals());

describe("BinanceSpot", () => {
  it("resolves a symbol and pages through klines", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      const body = url.includes("exchangeInfo")
        ? {
            symbols: [
              { symbol: "TRUMPUSDT", quoteAsset: "USDT" },
              { symbol: "TRUMPBTC", quoteAsset: "BTC" },
            ],
          }
        : new URL(url).searchParams.get("startTime") === "0"
          ? [
              [0, "1", "2", "0.5", "1.5"],
              [300000, "1.5", "2", "1", "1.8"],
            ]
          : [];
      return new Response(JSON.stringify(body));
    });
    const b = new BinanceSpot();
    const sig = { coin: "TRUMP", side: "short" as const, entryLow: 1, entryHigh: 1, targets: [0.9], stop: 1.1 };
    expect(await b.resolve("TRUMP", sig, async () => 1.02)).toEqual({ symbol: "TRUMPUSDT", multiplier: 1 });
    expect(await b.resolve("NOPE", sig, async () => 1)).toEqual({ error: "NOPE: no USDT pair on Binance spot" });
    const candles = await b.candles("TRUMPUSDT", 5, 0, 3_600_000);
    expect(candles).toEqual([
      { start: 0, open: 1, high: 2, low: 0.5, close: 1.5 },
      { start: 300000, open: 1.5, high: 2, low: 1, close: 1.8 },
    ]);
    expect(calls.filter((c) => c.includes("klines"))).toHaveLength(2);
  });
});
