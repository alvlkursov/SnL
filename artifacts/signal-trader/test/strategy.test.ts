import { describe, expect, it } from "vitest";
import { parseSignal } from "../src/parser.js";
import {
  chooseLeverage,
  decideEntry,
  filterReason,
  liquidationPrice,
  positionSize,
  safeLeverage,
} from "../src/strategy.js";
import type { Signal } from "../src/types.js";
import { FF, TRUMP } from "./samples.js";

const sig = (t: string): Signal => {
  const r = parseSignal(t);
  if (r.kind !== "signal") throw new Error("bad sample");
  return r.signal;
};
const cfg = { MIN_RR: 0.3, MAX_LEVERAGE: 20, LIQ_BUFFER: 1.5, RISK_PER_TRADE_PCT: 1, TAKER_FEE_PCT: 0 };

describe("decideEntry", () => {
  const short = sig(TRUMP); // zone 2.034–2.078, target 2.006, stop 2.14
  it("short: market inside the zone or above it", () => {
    expect(decideEntry(short, 2.05, cfg)).toEqual({ action: "market", price: 2.05 });
    expect(decideEntry(short, 2.1, cfg)).toEqual({ action: "market", price: 2.1 });
  });
  it("short: limit at the zone bottom when price is below it", () => {
    // At the zone bottom reward:risk is only 0.26 (target 1.4% away, stop 5.2%).
    expect(decideEntry(short, 2.02, { MIN_RR: 0.2 })).toEqual({ action: "limit", price: 2.034 });
    expect(decideEntry(short, 2.02, cfg).action).toBe("skip");
  });
  it("skips when price is past stop or target", () => {
    expect(decideEntry(short, 2.2, cfg).action).toBe("skip");
    expect(decideEntry(short, 2.0, cfg).action).toBe("skip");
  });
  it("skips poor reward:risk", () => {
    expect(decideEntry(short, 2.035, { MIN_RR: 1 })).toMatchObject({ action: "skip" });
  });

  const long = sig(FF); // zone 0.12888–0.13074, target 0.13189, stop 0.12587
  it("long: market at or below zone top, limit above it", () => {
    expect(decideEntry(long, 0.13, cfg)).toEqual({ action: "market", price: 0.13 });
    expect(decideEntry(long, 0.1315, { MIN_RR: 0.2 })).toEqual({ action: "limit", price: 0.13074 });
  });
});

describe("leverage", () => {
  it("caps the channel's 75x so liquidation stays beyond the stop", () => {
    const s = sig(FF);
    const entry = 0.13;
    const lev = chooseLeverage(s, entry, cfg);
    expect(lev).toBeLessThan(75);
    expect(liquidationPrice("long", entry, lev)).toBeLessThan(s.stop);
    // The channel's own leverage would be liquidated before the stop.
    expect(liquidationPrice("long", entry, 75)).toBeGreaterThan(s.stop);
  });
  it("safeLeverage shrinks as the stop widens", () => {
    expect(safeLeverage(100, 99, 1.5)).toBeGreaterThan(safeLeverage(100, 95, 1.5));
  });
});

describe("filterReason", () => {
  const f = { TRADE_TYPES: ["краткосрок"], COIN_BLACKLIST: ["FF"] };
  it("matches any of several trade types", () => {
    expect(filterReason({ ...sig(TRUMP), tradeType: "краткосрок, среднесрок" }, f)).toBeUndefined();
    expect(filterReason({ ...sig(TRUMP), tradeType: "среднесрок" }, f)).toMatch(/TRADE_TYPES/);
    expect(filterReason(sig(FF), f)).toBe("FF is blacklisted");
  });
});

describe("positionSize", () => {
  it("loses exactly the risk budget at the stop", () => {
    const qty = positionSize(1000, 2.05, 2.14, cfg);
    expect(qty * (2.14 - 2.05)).toBeCloseTo(10);
  });
  it("includes fees in the risk budget", () => {
    const withFees = positionSize(1000, 2.05, 2.14, { ...cfg, TAKER_FEE_PCT: 0.055 });
    expect(withFees).toBeLessThan(positionSize(1000, 2.05, 2.14, cfg));
  });
});
