import type { StrategyConfig } from "../config.js";
import { chooseLeverage, decideEntry, liquidationPrice } from "../strategy.js";
import type { Candle, Signal } from "../types.js";
import { runVariant, type VariantOutcome } from "./variants.js";

export type Outcome = Exclude<VariantOutcome, "no_fill"> | "no_fill" | "skipped";

export interface SimResult {
  outcome: Outcome;
  reason?: string;
  entryType?: "market" | "limit";
  entry?: number;
  exit?: number;
  entryTime?: number;
  exitTime?: number;
  /** Net result in units of risk (1R = the loss at the stop), fees included. */
  r?: number;
  /** Price move in the trade's favour, percent, fees included. */
  movePct?: number;
  /** Leverage our risk rules would use. */
  leverage?: number;
  /** Would the channel's own leverage have been liquidated before the trade closed? */
  channelLiquidated?: boolean;
}

export type SimConfig = Pick<
  StrategyConfig,
  | "ENTRY_FRAC"
  | "TP_MULT"
  | "SL_MULT"
  | "BREAKEVEN_AT"
  | "MIN_RR"
  | "ENTRY_TIMEOUT_MIN"
  | "TAKER_FEE_PCT"
  | "MAX_LEVERAGE"
  | "LIQ_BUFFER"
>;

/** Replays a signal with the live bot's rules on candles that start at or after its publication. */
export function simulate(s: Signal, candles: Candle[], cfg: SimConfig): SimResult {
  const first = candles[0];
  if (!first) return { outcome: "skipped", reason: "no candles" };
  const d = decideEntry(s, first.open, cfg);
  if (d.action === "skip") return { outcome: "skipped", reason: d.reason };

  const res = runVariant(
    s,
    candles,
    {
      entryFrac: cfg.ENTRY_FRAC,
      parts: 1,
      tpK: cfg.TP_MULT,
      slM: cfg.SL_MULT,
      beAt: cfg.BREAKEVEN_AT || undefined,
      entryTimeoutMin: cfg.ENTRY_TIMEOUT_MIN,
    },
    cfg.TAKER_FEE_PCT,
  );
  if (!res.filled) return { outcome: "no_fill", entryType: d.action };

  const entry = res.entry!;
  const long = s.side === "long";
  // The channel's leverage applied to the channel's own stop: is liquidation hit first?
  let channelLiquidated = false;
  if (s.leverage) {
    const liq = liquidationPrice(s.side, entry, s.leverage);
    if (long ? liq > res.stop! : liq < res.stop!) {
      channelLiquidated = candles.some(
        (k) => k.start >= res.entryTime! && k.start <= res.exitTime! && (long ? k.low <= liq : k.high >= liq),
      );
    }
  }
  return {
    outcome: res.outcome,
    entryType: d.action,
    entry,
    exit: res.exit,
    entryTime: res.entryTime,
    exitTime: res.exitTime,
    r: res.r,
    movePct: (res.r * Math.abs(entry - res.stop!) * 100) / entry,
    leverage: chooseLeverage(s.leverage, entry, res.stop!, cfg),
    channelLiquidated,
  };
}
