import type { StrategyConfig } from "../config.js";
import { chooseLeverage, decideEntry, liquidationPrice } from "../strategy.js";
import type { Candle, Signal } from "../types.js";

export type Outcome = "target" | "stop" | "timeout" | "no_fill" | "missed" | "skipped";

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

/**
 * Replays a signal on candles that start at or after its publication.
 * When a candle touches both stop and target the stop is assumed first (pessimistic).
 */
export function simulate(
  s: Signal,
  candles: Candle[],
  cfg: Pick<StrategyConfig, "MIN_RR" | "ENTRY_TIMEOUT_MIN" | "TAKER_FEE_PCT" | "MAX_LEVERAGE" | "LIQ_BUFFER">,
): SimResult {
  const first = candles[0];
  if (!first) return { outcome: "skipped", reason: "no candles" };
  const long = s.side === "long";
  const target = s.targets[0]!;
  const hitStop = (k: Candle) => (long ? k.low <= s.stop : k.high >= s.stop);
  const hitTarget = (k: Candle) => (long ? k.high >= target : k.low <= target);

  const d = decideEntry(s, first.open, cfg);
  if (d.action === "skip") return { outcome: "skipped", reason: d.reason };

  let fill = 0;
  if (d.action === "limit") {
    const deadline = first.start + cfg.ENTRY_TIMEOUT_MIN * 60_000;
    fill = -1;
    for (let i = 0; i < candles.length && candles[i]!.start < deadline; i++) {
      const k = candles[i]!;
      if (hitTarget(k)) return { outcome: "missed", entryType: "limit", reason: "target reached before fill" };
      if (long ? k.low <= d.price : k.high >= d.price) {
        fill = i;
        break;
      }
    }
    if (fill < 0) return { outcome: "no_fill", entryType: "limit" };
  }

  const entry = d.price;
  const leverage = chooseLeverage(s, entry, cfg);
  const liq = s.leverage ? liquidationPrice(s.side, entry, s.leverage) : undefined;
  const liqBeforeStop = liq !== undefined && (long ? liq > s.stop : liq < s.stop);
  let channelLiquidated = false;

  let outcome: Outcome = "timeout";
  let exit = candles[candles.length - 1]!.close;
  let exitTime = candles[candles.length - 1]!.start;
  for (let i = fill; i < candles.length; i++) {
    const k = candles[i]!;
    if (liqBeforeStop && (long ? k.low <= liq! : k.high >= liq!)) channelLiquidated = true;
    if (hitStop(k)) {
      outcome = "stop";
      exit = s.stop;
      exitTime = k.start;
      break;
    }
    // On a limit fill candle we can't tell whether the target came before or after the fill.
    if ((i > fill || d.action === "market") && hitTarget(k)) {
      outcome = "target";
      exit = target;
      exitTime = k.start;
      break;
    }
  }

  const dir = long ? 1 : -1;
  const fees = (entry + exit) * (cfg.TAKER_FEE_PCT / 100);
  const net = (exit - entry) * dir - fees;
  return {
    outcome,
    entryType: d.action,
    entry,
    exit,
    entryTime: candles[fill]!.start,
    exitTime,
    r: net / Math.abs(entry - s.stop),
    movePct: (net / entry) * 100,
    leverage,
    channelLiquidated,
  };
}
