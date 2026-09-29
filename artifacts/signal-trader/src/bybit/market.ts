import { RestClientV5, type LinearInverseInstrumentInfoV5 } from "bybit-api";
import type { Candle, Signal } from "../types.js";

export type Instrument = LinearInverseInstrumentInfoV5;

export interface ResolvedSymbol {
  symbol: string;
  /** Exchange price = channel price × multiplier (e.g. 1000 for 1000PEPEUSDT). */
  multiplier: number;
  instrument: Instrument;
}

const MULTIPLIERS = [1, 1000, 10000, 100000, 1000000, 10000000];

export function unwrap<T>(res: { retCode: number; retMsg: string; result: T }, what: string): T {
  if (res.retCode !== 0) throw new Error(`Bybit ${what}: ${res.retCode} ${res.retMsg}`);
  return res.result;
}

export class Market {
  private instruments?: Map<string, Instrument>;

  constructor(readonly client: RestClientV5 = new RestClientV5()) {}

  async loadInstruments(): Promise<Map<string, Instrument>> {
    if (this.instruments) return this.instruments;
    const map = new Map<string, Instrument>();
    let cursor: string | undefined;
    do {
      const res = unwrap(
        await this.client.getInstrumentsInfo({ category: "linear", limit: 1000, cursor }),
        "instruments",
      );
      for (const i of res.list as Instrument[]) {
        if (i.quoteCoin === "USDT" && i.contractType === "LinearPerpetual") map.set(i.symbol, i);
      }
      cursor = res.nextPageCursor || undefined;
    } while (cursor);
    this.instruments = map;
    return map;
  }

  /**
   * Finds the USDT perpetual for a coin. When several exist (TRUMPUSDT vs 1000TRUMPUSDT),
   * the one whose price matches the signal is chosen via `priceAt`.
   */
  async resolve(
    coin: string,
    signal: Signal,
    priceAt: (symbol: string) => Promise<number | undefined>,
  ): Promise<ResolvedSymbol | { error: string }> {
    const instruments = await this.loadInstruments();
    const picked = await pickSymbol(coin, signal, new Set(instruments.keys()), priceAt, "USDT perpetual on Bybit");
    return "error" in picked ? picked : { ...picked, instrument: instruments.get(picked.symbol)! };
  }

  async lastPrice(symbol: string): Promise<number | undefined> {
    const res = unwrap(await this.client.getTickers({ category: "linear", symbol }), "ticker");
    const p = Number(res.list[0]?.lastPrice);
    return Number.isFinite(p) && p > 0 ? p : undefined;
  }

  /** Candles in [start, end), oldest first. */
  async candles(symbol: string, intervalMin: number, start: number, end: number): Promise<Candle[]> {
    const out: Candle[] = [];
    const step = intervalMin * 60_000;
    let from = start - (start % step);
    while (from < end) {
      const to = Math.min(end, from + step * 1000) - 1;
      const res = unwrap(
        await this.client.getKline({
          category: "linear",
          symbol,
          interval: String(intervalMin) as "1",
          start: from,
          end: to,
          limit: 1000,
        }),
        "kline",
      );
      const batch = res.list
        .map(([t, o, h, l, c]) => ({ start: Number(t), open: +o, high: +h, low: +l, close: +c }))
        .filter((k) => k.start >= from && k.start <= to)
        .sort((a, b) => a.start - b.start);
      out.push(...batch);
      from = to + 1;
    }
    return out;
  }
}

/**
 * Chooses among COINUSDT, 1000COINUSDT, … the listing whose price matches the signal.
 * The channel may quote the coin's own price or the ×1000 contract's price.
 */
export async function pickSymbol(
  coin: string,
  signal: Signal,
  listed: Set<string>,
  priceAt: (symbol: string) => Promise<number | undefined>,
  what: string,
): Promise<{ symbol: string; multiplier: number } | { error: string }> {
  const candidates = MULTIPLIERS.map((m) => ({ m, symbol: `${m === 1 ? "" : m}${coin}USDT` })).filter((c) =>
    listed.has(c.symbol),
  );
  if (candidates.length === 0) return { error: `${coin}: no ${what}` };

  const ref = (signal.entryLow + signal.entryHigh) / 2;
  let best: { symbol: string; multiplier: number; dev: number } | undefined;
  for (const c of candidates) {
    const price = await priceAt(c.symbol);
    if (price === undefined) continue;
    for (const multiplier of new Set([c.m, 1])) {
      const dev = Math.abs(Math.log(price / multiplier / ref));
      if (!best || dev < best.dev) best = { symbol: c.symbol, multiplier, dev };
    }
  }
  if (!best) return { error: `${coin}: no price data` };
  // More than ~35% away from the entry zone means a wrong coin or a typo in the post.
  if (best.dev > Math.log(1.35)) return { error: `${coin}: market price does not match signal` };
  return { symbol: best.symbol, multiplier: best.multiplier };
}

export function scaleSignal(s: Signal, m: number): Signal {
  if (m === 1) return s;
  return {
    ...s,
    entryLow: s.entryLow * m,
    entryHigh: s.entryHigh * m,
    stop: s.stop * m,
    targets: s.targets.map((t) => t * m),
  };
}

function decimals(step: string): number {
  const i = step.indexOf(".");
  return i < 0 ? 0 : step.replace(/0+$/, "").length - i - 1;
}

export function roundPrice(i: Instrument, price: number): string {
  const tick = Number(i.priceFilter.tickSize);
  return (Math.round(price / tick) * tick).toFixed(decimals(i.priceFilter.tickSize));
}

/** Rounds down so we never exceed the intended risk. */
export function roundQty(i: Instrument, qty: number): string {
  const step = Number(i.lotSizeFilter.qtyStep);
  return (Math.floor(qty / step + 1e-9) * step).toFixed(decimals(i.lotSizeFilter.qtyStep));
}
