import type { StrategyConfig } from "./config.js";
import type { Signal } from "./types.js";

export type EntryDecision =
  | { action: "market"; price: number }
  | { action: "limit"; price: number }
  | { action: "skip"; reason: string };

/**
 * Where to enter given the current price.
 * At or better than the zone (below its top for a long, above its bottom for a short) we enter
 * at market; otherwise we rest a limit at the zone edge.
 */
export function decideEntry(s: Signal, price: number, cfg: Pick<StrategyConfig, "MIN_RR">): EntryDecision {
  const target = s.targets[0]!;
  const long = s.side === "long";
  if (long ? price <= s.stop : price >= s.stop) return { action: "skip", reason: "price already past stop" };
  if (long ? price >= target : price <= target) return { action: "skip", reason: "price already past target" };

  const inZoneOrBetter = long ? price <= s.entryHigh : price >= s.entryLow;
  const entry = inZoneOrBetter ? price : long ? s.entryHigh : s.entryLow;
  const rr = rewardRisk(s, entry);
  if (rr < cfg.MIN_RR) return { action: "skip", reason: `reward:risk ${rr.toFixed(2)} < ${cfg.MIN_RR}` };
  return { action: inZoneOrBetter ? "market" : "limit", price: entry };
}

export function rewardRisk(s: Signal, entry: number): number {
  return Math.abs(s.targets[0]! - entry) / Math.abs(entry - s.stop);
}

/** Maintenance margin rate assumed when estimating liquidation; Bybit alts are 0.5–2.5%. */
const MMR = 0.01;

/**
 * Highest leverage whose liquidation price stays LIQ_BUFFER times further than the stop.
 * With isolated margin, liquidation distance ≈ 1/leverage − MMR.
 */
export function safeLeverage(entry: number, stop: number, liqBuffer: number): number {
  const stopDist = Math.abs(entry - stop) / entry;
  return Math.max(1, Math.floor(1 / (stopDist * liqBuffer + MMR)));
}

export function chooseLeverage(
  s: Signal,
  entry: number,
  cfg: Pick<StrategyConfig, "MAX_LEVERAGE" | "LIQ_BUFFER">,
  exchangeMax = Infinity,
): number {
  return Math.max(
    1,
    Math.min(
      s.leverage ?? cfg.MAX_LEVERAGE,
      cfg.MAX_LEVERAGE,
      exchangeMax,
      safeLeverage(entry, s.stop, cfg.LIQ_BUFFER),
    ),
  );
}

/** Approximate liquidation price for isolated margin. */
export function liquidationPrice(side: Signal["side"], entry: number, leverage: number): number {
  const d = 1 / leverage - MMR;
  return side === "long" ? entry * (1 - d) : entry * (1 + d);
}

/**
 * Position size such that hitting the stop loses `equity * RISK_PER_TRADE_PCT`, fees included.
 * Leverage does not change this number; it only changes how much margin is locked.
 */
export function positionSize(
  equity: number,
  entry: number,
  stop: number,
  cfg: Pick<StrategyConfig, "RISK_PER_TRADE_PCT" | "TAKER_FEE_PCT">,
): number {
  const riskUsd = (equity * cfg.RISK_PER_TRADE_PCT) / 100;
  const fee = cfg.TAKER_FEE_PCT / 100;
  const lossPerUnit = Math.abs(entry - stop) + (entry + stop) * fee;
  return riskUsd / lossPerUnit;
}

export function filterReason(
  s: Signal,
  cfg: Pick<StrategyConfig, "TRADE_TYPES" | "COIN_BLACKLIST">,
): string | undefined {
  if (cfg.COIN_BLACKLIST.includes(s.coin)) return `${s.coin} is blacklisted`;
  if (cfg.TRADE_TYPES.length && !cfg.TRADE_TYPES.includes(s.tradeType ?? "")) {
    return `trade type "${s.tradeType ?? "—"}" not in TRADE_TYPES`;
  }
  return undefined;
}
