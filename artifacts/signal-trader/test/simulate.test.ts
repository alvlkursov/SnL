import { describe, expect, it } from "vitest";
import { simulate } from "../src/backtest/simulate.js";
import { summarize } from "../src/backtest/report.js";
import type { Candle, Signal } from "../src/types.js";

const cfg = { MIN_RR: 0.3, ENTRY_TIMEOUT_MIN: 60, TAKER_FEE_PCT: 0, MAX_LEVERAGE: 20, LIQ_BUFFER: 1.5 };
const long: Signal = { coin: "X", side: "long", leverage: 50, entryLow: 98, entryHigh: 100, targets: [104], stop: 96 };
let t = 0;
const k = (open: number, high: number, low: number, close = open): Candle => ({
  start: (t += 60_000),
  open,
  high,
  low,
  close,
});

describe("simulate", () => {
  it("market entry that reaches the target", () => {
    t = 0;
    const r = simulate(long, [k(99, 100, 98.5), k(100, 104.5, 99.5)], cfg);
    expect(r).toMatchObject({ outcome: "target", entryType: "market", entry: 99, exit: 104 });
    expect(r.r).toBeCloseTo(5 / 3);
  });

  it("assumes the stop first when a candle touches both", () => {
    t = 0;
    expect(simulate(long, [k(99, 105, 95)], cfg)).toMatchObject({ outcome: "stop", exit: 96, r: -1 });
  });

  it("limit entry fills later, then stops out", () => {
    t = 0;
    const r = simulate(long, [k(101, 102, 100.5), k(100.5, 101, 99.8), k(99.8, 100, 95.5)], cfg);
    expect(r).toMatchObject({ outcome: "stop", entryType: "limit", entry: 100 });
  });

  it("limit entry that is never reached", () => {
    t = 0;
    expect(simulate(long, [k(101, 102, 100.5), k(101, 102, 100.5)], cfg)).toMatchObject({ outcome: "no_fill" });
    t = 0;
    expect(simulate(long, [k(101, 104.2, 100.5)], cfg)).toMatchObject({ outcome: "missed" });
  });

  it("flags liquidation at the channel's leverage", () => {
    t = 0;
    // 50x from 99 liquidates near 98.0, well above the 96 stop.
    const r = simulate(long, [k(99, 99.2, 97.5), k(98, 104.1, 97.9)], cfg);
    expect(r).toMatchObject({ outcome: "target", channelLiquidated: true });
  });

  it("summary maths", () => {
    const row = (r: number) => ({
      messageId: 1,
      date: new Date(),
      signal: long,
      result: { outcome: r > 0 ? "target" : "stop", r, exitTime: (t += 1) } as const,
    });
    const s = summarize([row(0.5), row(0.5), row(-1)], 1);
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.breakEvenWinRate).toBeCloseTo(1 / 1.5);
    expect(s.totalR).toBeCloseTo(0);
  });
});
