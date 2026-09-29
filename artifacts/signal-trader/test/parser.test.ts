import { describe, expect, it } from "vitest";
import { parseSignal } from "../src/parser.js";
import { BOME, FF, LINEA, TRUMP } from "./samples.js";

describe("parseSignal", () => {
  it.each([
    [
      TRUMP,
      {
        coin: "TRUMP",
        side: "short",
        leverage: 10,
        entryLow: 2.034,
        entryHigh: 2.078,
        targets: [2.006],
        stop: 2.14,
        tradeType: undefined,
      },
    ],
    [
      LINEA,
      {
        coin: "LINEA",
        side: "short",
        leverage: 37,
        entryLow: 0.002983,
        entryHigh: 0.003034,
        targets: [0.002952],
        stop: 0.003116,
        tradeType: undefined,
      },
    ],
    [
      BOME,
      {
        coin: "BOME",
        side: "long",
        leverage: 25,
        entryLow: 0.0009407,
        entryHigh: 0.0010419,
        targets: [0.0010785],
        stop: 0.000887,
        tradeType: "среднесрок",
      },
    ],
    [
      FF,
      {
        coin: "FF",
        side: "long",
        leverage: 75,
        entryLow: 0.12888,
        entryHigh: 0.13074,
        targets: [0.13189],
        stop: 0.12587,
        tradeType: "краткосрок",
      },
    ],
  ])("parses a real post", (text, expected) => {
    expect(parseSignal(text)).toEqual({ kind: "signal", signal: expected });
  });

  it("accepts latin x, a single entry price, commas and #tags", () => {
    const r = parseSignal("LONG\nМонета: #SOL/USDT\nПлечо: 5x\nВход: 150,5\nЦель: 160, 170\nСтоп: 140");
    expect(r).toMatchObject({
      kind: "signal",
      signal: { coin: "SOL", leverage: 5, entryLow: 150.5, entryHigh: 150.5, targets: [160, 170], stop: 140 },
    });
  });

  it("ignores ordinary posts", () => {
    expect(parseSignal("Всем доброе утро! Рынок сегодня спокойный")).toEqual({ kind: "other" });
  });

  it("rejects a stop on the wrong side", () => {
    expect(parseSignal(TRUMP.replace("2.14", "1.9"))).toEqual({
      kind: "invalid",
      reason: "short: stop must be above entry",
    });
    expect(parseSignal(FF.replace("0.12587", "0.14"))).toEqual({
      kind: "invalid",
      reason: "long: stop must be below entry",
    });
  });

  it("rejects a target on the wrong side", () => {
    expect(parseSignal(BOME.replace("0.0010785", "0.0009"))).toEqual({
      kind: "invalid",
      reason: "long: target must be above entry",
    });
  });

  it("flags a post that looks like a signal but misses fields", () => {
    expect(parseSignal(TRUMP.replace("▪️Стоп: 2.14", ""))).toEqual({ kind: "invalid", reason: "no stop" });
    expect(parseSignal(TRUMP.replace("SHORT", ""))).toEqual({ kind: "invalid", reason: "no LONG/SHORT" });
  });
});
