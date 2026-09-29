import { describe, expect, it } from "vitest";
import { parseSignal } from "../src/parser.js";
import {
  breakevenTrigger,
  chooseLeverage,
  decideEntry,
  filterReason,
  levels,
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
// "As posted": enter at the zone's worst edge, channel's own target and stop.
const channel = { ENTRY_FRAC: 0, TP_MULT: 1, SL_MULT: 1 };
const cfg = { ...channel, MIN_RR: 0.3, MAX_LEVERAGE: 20, LIQ_BUFFER: 1.5, RISK_PER_TRADE_PCT: 1, TAKER_FEE_PCT: 0 };

describe("decideEntry", () => {
  const short = sig(TRUMP); // zone 2.034–2.078, target 2.006, stop 2.14
  it("short: market inside the zone or above it", () => {
    expect(decideEntry(short, 2.05, cfg)).toMatchObject({ action: "market", price: 2.05, target: 2.006, stop: 2.14 });
    expect(decideEntry(short, 2.1, cfg)).toMatchObject({ action: "market", price: 2.1 });
  });
  it("short: limit at the zone bottom when price is below it", () => {
    // At the zone bottom reward:risk is only 0.26 (target 1.4% away, stop 5.2%).
    expect(decideEntry(short, 2.02, { ...channel, MIN_RR: 0.2 })).toMatchObject({ action: "limit", price: 2.034 });
    expect(decideEntry(short, 2.02, cfg).action).toBe("skip");
  });
  it("skips when price is past stop or target", () => {
    expect(decideEntry(short, 2.2, cfg).action).toBe("skip");
    expect(decideEntry(short, 2.0, cfg).action).toBe("skip");
  });
  it("skips poor reward:risk", () => {
    expect(decideEntry(short, 2.035, { ...channel, MIN_RR: 1 })).toMatchObject({ action: "skip" });
  });

  const long = sig(FF); // zone 0.12888–0.13074, target 0.13189, stop 0.12587
  it("long: market at or below zone top, limit above it", () => {
    expect(decideEntry(long, 0.13, cfg)).toMatchObject({ action: "market", price: 0.13 });
    expect(decideEntry(long, 0.1315, { ...channel, MIN_RR: 0.2 })).toMatchObject({ action: "limit", price: 0.13074 });
  });
});

describe("levels with the optimized rules", () => {
  const rules = { ENTRY_FRAC: 0.75, TP_MULT: 3, SL_MULT: 0.75 };
  it("measures from the zone's worst edge", () => {
    // FF long: worst edge 0.13074, best 0.12888, target 0.13189, stop 0.12587.
    const l = levels(sig(FF), rules);
    expect(l.entry).toBeCloseTo(0.129345, 6);
    expect(l.target).toBeCloseTo(0.13419, 6);
    expect(l.stop).toBeCloseTo(0.1270875, 6);
  });
  it("rests a limit deep in the zone when price is at the worst edge", () => {
    expect(decideEntry(sig(FF), 0.1307, { ...rules, MIN_RR: 0 })).toMatchObject({ action: "limit", price: 0.129345 });
    // TRUMP short: worst edge is the bottom (2.034), limit goes up to 2.067.
    const d = decideEntry(sig(TRUMP), 2.03, { ...rules, MIN_RR: 0 });
    expect(d.action).toBe("limit");
    expect(d.action !== "skip" && d.price).toBeCloseTo(2.067);
  });
  it("breakeven trigger lies between entry and target", () => {
    expect(breakevenTrigger(100, 110, 0.5)).toBe(105);
    expect(breakevenTrigger(100, 90, 0.5)).toBe(95);
    expect(breakevenTrigger(100, 110, 0)).toBeUndefined();
  });
});

describe("leverage", () => {
  it("caps the channel's 75x so liquidation stays beyond the stop", () => {
    const s = sig(FF);
    const entry = 0.13;
    const lev = chooseLeverage(s.leverage, entry, s.stop, cfg);
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
