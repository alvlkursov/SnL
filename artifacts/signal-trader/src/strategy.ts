import type { StrategyConfig } from "./config.js";
import type { Signal } from "./types.js";

export type LevelRules = Pick<StrategyConfig, "ENTRY_FRAC" | "TP_MULT" | "SL_MULT">;

export interface Levels {
  entry: number;
  target: number;
  stop: number;
}

/**
 * Our entry, target and stop for a signal. Everything is measured from the zone's worst edge
 * (top for a long, bottom for a short), which is where price usually is when the post appears.
 */
export function levels(s: Signal, r: LevelRules): Levels {
  const long = s.side === "long";
  const worst = long ? s.entryHigh : s.entryLow;
  const best = long ? s.entryLow : s.entryHigh;
  return {
    entry: worst + r.ENTRY_FRAC * (best - worst),
    target: worst + r.TP_MULT * (s.targets[0]! - worst),
    stop: worst - r.SL_MULT * (worst - s.stop),
  };
}

export type EntryDecision =
  | ({ action: "market" | "limit"; price: number } & Omit<Levels, "entry">)
  | { action: "skip"; reason: string };

/**
 * At or better than our entry level we buy/sell at market; otherwise we rest a limit at that level.
 */
export function decideEntry(s: Signal, price: number, cfg: LevelRules & Pick<StrategyConfig, "MIN_RR">): EntryDecision {
  const long = s.side === "long";
  const { entry, target, stop } = levels(s, cfg);
  if (long ? stop >= entry || target <= entry : stop <= entry || target >= entry) {
    return { action: "skip", reason: "stop/target on the wrong side of entry with these multipliers" };
  }
  if (long ? price <= stop : price >= stop) return { action: "skip", reason: "price already past stop" };
  if (long ? price >= target : price <= target) return { action: "skip", reason: "price already past target" };

  const atOrBetter = long ? price <= entry : price >= entry;
  const fill = atOrBetter ? price : entry;
  const rr = rewardRisk(target, stop, fill);
  if (rr < cfg.MIN_RR) return { action: "skip", reason: `reward:risk ${rr.toFixed(2)} < ${cfg.MIN_RR}` };
  return { action: atOrBetter ? "market" : "limit", price: fill, target, stop };
}

export function rewardRisk(target: number, stop: number, entry: number): number {
  return Math.abs(target - entry) / Math.abs(entry - stop);
}

/** Price at which the stop moves to entry, or undefined when BREAKEVEN_AT is off. */
export function breakevenTrigger(entry: number, target: number, beAt: number): number | undefined {
  return beAt > 0 ? entry + beAt * (target - entry) : undefined;
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
  channelLeverage: number | undefined,
  entry: number,
  stop: number,
  cfg: Pick<StrategyConfig, "MAX_LEVERAGE" | "LIQ_BUFFER">,
  exchangeMax = Infinity,
): number {
  return Math.max(
    1,
    Math.min(
      channelLeverage ?? cfg.MAX_LEVERAGE,
      cfg.MAX_LEVERAGE,
      exchangeMax,
      safeLeverage(entry, stop, cfg.LIQ_BUFFER),
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
  const types = s.tradeType?.split(", ") ?? [];
  if (cfg.TRADE_TYPES.length && !types.some((t) => cfg.TRADE_TYPES.includes(t))) {
    return `trade type "${s.tradeType ?? "—"}" not in TRADE_TYPES`;
  }
  return undefined;
}
