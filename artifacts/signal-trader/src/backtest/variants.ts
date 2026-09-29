import { levels } from "../strategy.js";
import type { Candle, Signal } from "../types.js";

/** One tradable signal of a backtest run (`data/backtest/dataset.json`). */
export interface DatasetEntry {
  messageId: number;
  date: string;
  symbol: string;
  /** Already scaled to exchange prices. */
  signal: Signal;
  /** Path of the cached candle file. */
  candles: string;
}

/**
 * Parametrised execution of a signal. Levels are relative to the zone's worst edge — where price
 * usually is when the post appears (top of the zone for a long, bottom for a short):
 *
 *   entryFrac  0 = enter at the worst edge (i.e. now), 1 = wait for the best edge
 *   parts      >1 splits the position into equal orders spread from the worst edge to entryFrac
 *   tpK        target distance as a multiple of the channel's (1 = channel target)
 *   slM        stop distance as a multiple of the channel's (1 = channel stop)
 *   beAt       after price covers this share of the way to the target, move the stop to entry
 */
export interface Variant {
  entryFrac: number;
  parts: number;
  tpK: number;
  slM: number;
  beAt?: number;
  entryTimeoutMin: number;
}

export type VariantOutcome = "target" | "stop" | "breakeven" | "timeout" | "no_fill";

export interface VariantResult {
  filled: boolean;
  /** Result in units of risk (the loss at the stop), fees included. */
  r: number;
  outcome: VariantOutcome;
  /** Average fill price, exit price and times; set when filled. */
  entry?: number;
  exit?: number;
  stop?: number;
  entryTime?: number;
  exitTime?: number;
}

const NO_FILL: VariantResult = { filled: false, r: 0, outcome: "no_fill" };

/** Replays a signal on candles starting at publication. Pessimistic: a candle touching both stop and target is a loss. */
export function runVariant(s: Signal, candles: Candle[], v: Variant, feePct: number): VariantResult {
  const long = s.side === "long";
  const dir = long ? 1 : -1;
  const lv = (frac: number) => levels(s, { ENTRY_FRAC: frac, TP_MULT: v.tpK, SL_MULT: v.slM });
  const { target: tp, stop: sl0 } = lv(v.entryFrac);
  const fee = feePct / 100;

  const entries = Array.from({ length: v.parts }, (_, i) =>
    v.parts === 1 ? lv(v.entryFrac).entry : lv((v.entryFrac * i) / (v.parts - 1)).entry,
  );
  // Stop and target must lie beyond every entry, otherwise the multipliers make no sense for this signal.
  if (entries.some((e) => (long ? sl0 >= e || tp <= e : sl0 <= e || tp >= e))) return NO_FILL;
  // Planned risk of the full position (1 unit per part) — the denominator of R.
  const plannedRisk = entries.reduce((a, e) => a + Math.abs(e - sl0), 0);

  const first = candles[0];
  if (!first) return NO_FILL;
  const deadline = first.start + v.entryTimeoutMin * 60_000;
  const p0 = first.open;
  if (long ? p0 <= sl0 || p0 >= tp : p0 >= sl0 || p0 <= tp) return NO_FILL;

  const filled: number[] = [];
  const pending: number[] = [];
  // Orders at or worse than the current price fill immediately at the current price.
  for (const e of entries) (long ? p0 <= e : p0 >= e) ? filled.push(p0) : pending.push(e);
  let entryTime = filled.length ? first.start : undefined;

  let sl = sl0;
  let exit: number | undefined;
  let exitTime: number | undefined;
  let outcome: VariantOutcome = "timeout";
  for (const k of candles) {
    const hadPosition = filled.length > 0;
    // Resting entries fill if touched before the deadline; unfilled ones are dropped afterwards.
    if (k.start < deadline) {
      for (let j = pending.length - 1; j >= 0; j--) {
        if (long ? k.low <= pending[j]! : k.high >= pending[j]!) {
          filled.push(pending[j]!);
          pending.splice(j, 1);
          entryTime ??= k.start;
        }
      }
    } else pending.length = 0;
    if (filled.length === 0) {
      // The move happened without us, or the entry expired.
      if ((long ? k.high >= tp : k.low <= tp) || pending.length === 0) return NO_FILL;
      continue;
    }
    if (long ? k.low <= sl : k.high >= sl) {
      exit = sl;
      exitTime = k.start;
      outcome = sl === sl0 ? "stop" : "breakeven";
      break;
    }
    // On the candle that filled us we can't tell whether the target came before the fill.
    if (hadPosition && (long ? k.high >= tp : k.low <= tp)) {
      exit = tp;
      exitTime = k.start;
      outcome = "target";
      break;
    }
    if (hadPosition && v.beAt && sl === sl0) {
      const avg = filled.reduce((a, b) => a + b, 0) / filled.length;
      const trigger = avg + v.beAt * (tp - avg);
      // Takes effect from the next candle; the stop sits just past entry to cover fees.
      if (long ? k.high >= trigger : k.low <= trigger) sl = avg + dir * avg * 2 * fee;
    }
  }
  if (filled.length === 0) return NO_FILL;
  const last = candles[candles.length - 1]!;
  exit ??= last.close;
  exitTime ??= last.start;
  const pnl = filled.reduce((a, e) => a + dir * (exit! - e) - (e + exit!) * fee, 0);
  const entry = filled.reduce((a, b) => a + b, 0) / filled.length;
  // A single order is sized from its actual fill, like the live bot does; a split position from its plan.
  const risk = v.parts === 1 ? Math.abs(entry - sl0) : plannedRisk;
  return { filled: true, r: pnl / risk, outcome, entry, exit, stop: sl0, entryTime, exitTime };
}
